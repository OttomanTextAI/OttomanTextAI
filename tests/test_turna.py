from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

print("Model indiriliyor, ilk seferde biraz sürebilir...")

tokenizer = AutoTokenizer.from_pretrained("boun-tabi-LMG/TURNA")
model = AutoModelForSeq2SeqLM.from_pretrained("boun-tabi-LMG/TURNA")

print("Model yüklendi!")

text = "sadeleştir: Devlet-i Aliyye-i Osmaniyye hazine-i evrakına idhal olunan vesikalar."
inputs = tokenizer(text, return_tensors="pt")
outputs = model.generate(**inputs, max_length=100)

print("ÇIKTI:", tokenizer.decode(outputs[0], skip_special_tokens=True))