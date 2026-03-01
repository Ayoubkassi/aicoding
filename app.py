import os
import json
import re
import shutil
import subprocess
import tempfile
from flask import Flask, request, jsonify, send_from_directory, Response
from dotenv import load_dotenv
from mistralai import Mistral
from elevenlabs.client import ElevenLabs

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")

api_key = os.environ.get("MISTRAL_API_KEY", "")
client = None

eleven_key = os.environ.get("ELEVENLABS_API_KEY", "")
eleven_voice = os.environ.get("ELEVENLABS_VOICE_ID", "cjVigY5qzO86Huf0OWal")
eleven_client = None


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    global client
    if not api_key or api_key == "your_mistral_api_key_here":
        return jsonify({"error": "Set MISTRAL_API_KEY in .env file"}), 500

    if client is None:
        client = Mistral(api_key=api_key)

    data = request.json
    messages = data.get("messages", [])

    try:
        response = client.chat.complete(
            model="mistral-large-2512",
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tts", methods=["POST"])
def tts():
    global eleven_client
    if not eleven_key:
        return jsonify({"error": "Set ELEVENLABS_API_KEY in .env"}), 500

    text = request.json.get("text", "")
    if not text:
        return jsonify({"error": "No text"}), 400

    if eleven_client is None:
        eleven_client = ElevenLabs(api_key=eleven_key)

    try:
        audio = eleven_client.text_to_speech.convert(
            text=text,
            voice_id=eleven_voice,
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_128",
        )
        return Response(audio, mimetype="audio/mpeg")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analyze-frame", methods=["POST"])
def analyze_frame():
    global client
    if not api_key or api_key == "your_mistral_api_key_here":
        return jsonify({"error": "Set MISTRAL_API_KEY in .env file"}), 500

    if client is None:
        client = Mistral(api_key=api_key)

    data = request.json
    image_b64 = data.get("image", "")
    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    if not image_b64.startswith("data:"):
        image_b64 = f"data:image/jpeg;base64,{image_b64}"

    try:
        response = client.chat.complete(
            model="mistral-large-2512",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "You are analyzing a webcam frame from a coding interview. "
                                "Be VERY conservative — only flag something if you are highly confident.\n\n"
                                "IMPORTANT RULES:\n"
                                "- A person glancing slightly to the side, reading their code editor, or looking at their keyboard is NORMAL. Do NOT flag this.\n"
                                "- 'lookingAway' means the person has their head clearly turned away from the screen for an extended period (e.g. reading from a paper, talking to someone off-camera). Brief glances are NOT looking away.\n"
                                "- 'multiplePeople' means you can CLEARLY see a second distinct human face or body in the frame. Posters, photos on walls, reflections, or shadows do NOT count.\n"
                                "- 'secondScreen' means you can clearly see a phone, tablet, or second monitor being actively used. A phone lying flat on a desk or a monitor that's off does NOT count.\n\n"
                                "Return ONLY valid JSON:\n"
                                '{"lookingAway": false, "multiplePeople": false, "secondScreen": false, "confidence": 0.0}\n'
                                "- Set confidence (0.0-1.0) for how certain you are about ANY flag being true.\n"
                                "- Default everything to false. Only set true if you are >90% certain.\n"
                                "- When in doubt, return all false. False negatives are much better than false positives."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": image_b64,
                        },
                    ],
                }
            ],
            temperature=0.0,
            max_tokens=150,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            result = {"lookingAway": False, "multiplePeople": False, "secondScreen": False, "confidence": 0.0}

        confidence = float(result.get("confidence", 0.0))
        if confidence < 0.85:
            result["lookingAway"] = False
            result["multiplePeople"] = False
            result["secondScreen"] = False

        result.setdefault("lookingAway", False)
        result.setdefault("multiplePeople", False)
        result.setdefault("secondScreen", False)
        result["confidence"] = confidence

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/run", methods=["POST"])
def run_code():
    data = request.json
    code = data.get("code", "")
    language = data.get("language", "python")

    suffixes = {
        "python": ".py",
        "javascript": ".js",
        "c": ".c",
        "cpp": ".cpp",
        "go": ".go",
        "java": ".java",
    }

    suffix = suffixes.get(language, ".txt")

    try:
        if language == "java":
            match = re.search(r"public\s+class\s+(\w+)", code)
            class_name = match.group(1) if match else "Main"

            tmpdir = tempfile.mkdtemp()
            java_file = os.path.join(tmpdir, f"{class_name}.java")
            with open(java_file, "w") as f:
                f.write(code)

            comp = subprocess.run(
                ["javac", java_file],
                capture_output=True, text=True, timeout=15,
            )
            if comp.returncode != 0:
                shutil.rmtree(tmpdir, ignore_errors=True)
                return jsonify({"output": "Compilation Error:\n" + comp.stderr})

            result = subprocess.run(
                ["java", "-cp", tmpdir, class_name],
                capture_output=True, text=True, timeout=10,
            )
            output = result.stdout + result.stderr
            shutil.rmtree(tmpdir, ignore_errors=True)
            return jsonify({"output": output or "(no output)"})

        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=suffix, delete=False, dir=tempfile.gettempdir()
        )
        tmp.write(code)
        tmp.close()

        if language == "python":
            cmd = ["python3", tmp.name]
        elif language == "javascript":
            cmd = ["node", tmp.name]
        elif language == "cpp":
            out_path = tmp.name + ".out"
            comp = subprocess.run(
                ["g++", tmp.name, "-o", out_path],
                capture_output=True, text=True, timeout=15,
            )
            if comp.returncode != 0:
                os.unlink(tmp.name)
                return jsonify({"output": "Compilation Error:\n" + comp.stderr})
            result = subprocess.run(
                [out_path], capture_output=True, text=True, timeout=10
            )
            os.unlink(tmp.name)
            os.unlink(out_path)
            output = result.stdout + result.stderr
            return jsonify({"output": output or "(no output)"})
        elif language == "c":
            out_path = tmp.name + ".out"
            comp = subprocess.run(
                ["gcc", tmp.name, "-o", out_path],
                capture_output=True, text=True, timeout=15,
            )
            if comp.returncode != 0:
                os.unlink(tmp.name)
                return jsonify({"output": "Compilation Error:\n" + comp.stderr})
            result = subprocess.run(
                [out_path], capture_output=True, text=True, timeout=10
            )
            os.unlink(tmp.name)
            os.unlink(out_path)
            output = result.stdout + result.stderr
            return jsonify({"output": output or "(no output)"})
        elif language == "go":
            cmd = ["go", "run", tmp.name]
        else:
            os.unlink(tmp.name)
            return jsonify({"output": f"Language '{language}' execution not supported."})

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        output = result.stdout + result.stderr
        os.unlink(tmp.name)
        return jsonify({"output": output or "(no output)"})

    except subprocess.TimeoutExpired:
        return jsonify({"output": "Error: Execution timed out (10s limit)"})
    except FileNotFoundError:
        return jsonify(
            {"output": f"Error: Runtime for '{language}' not found on this machine."}
        )
    except Exception as e:
        return jsonify({"output": f"Error: {str(e)}"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"\n  HireAI Platform running at http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=True)