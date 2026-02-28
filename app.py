import os
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
eleven_voice = os.environ.get("ELEVENLABS_VOICE_ID", "1kPiKqeeOH1T30gvvZOi")
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
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        audio_bytes = b"".join(audio)
        return Response(audio_bytes, mimetype="audio/mpeg")
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
    }

    suffix = suffixes.get(language, ".txt")

    try:
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
