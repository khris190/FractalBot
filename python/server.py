from sentence_transformers import SentenceTransformer, SimilarityFunction
import torch
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class SentenceStore:
    sentences = [
        "hi.",
    ]
    model = SentenceTransformer(
        "sentence-transformers/all-MiniLM-L6-v2",
        similarity_fn_name=SimilarityFunction.DOT_PRODUCT,
    )

    encodedSentences = []

    def __init__(self):
        self.encodedSentences = self.model.encode(self.sentences)
        pass

    def _add_sentence(self, sentence: str):
        self.sentences.append(sentence)
        self.encodedSentences = self.model.encode(self.sentences)  # TODO: optimize me

    def compare(self, sentence: str, treshold=0.5):
        sentences = self.model.encode([sentence])
        # Get the similarity scores for the embeddings
        similarities = self.model.similarity(sentences, sentencesStore.encodedSentences)  # type: ignore
        assert isinstance(similarities, torch.Tensor)
        # Prepare JSON response
        similarity = similarities[0].max()
        print("sentence", sentence)
        print("similarity", similarity)
        if similarity < treshold:
            self._add_sentence(sentence)
        return similarity.tolist()


sentencesStore = SentenceStore()


class server(BaseHTTPRequestHandler):
    def do_POST(self):
        # send the message back
        # 1️⃣ Read request body
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length)
        body_str = body_bytes.decode("utf-8")
        print(body_str)

        # 2️⃣ Parse JSON body (expecting {"sentence": "..."} )
        try:
            data = json.loads(body_str)
            sentence = data.get("sentence")
            treshold = data.get("treshold")
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        if not sentence:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Missing "sentence" in request')
            return

        # Send headers first
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()

        response_json = json.dumps(sentencesStore.compare(sentence, treshold))
        # Write the body as bytes
        self.wfile.write(response_json.encode("utf-8"))


with HTTPServer(("", 5000), server) as s:
    s.serve_forever()
