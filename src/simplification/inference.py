"""
src/simplification/inference.py

Senin (Zeynep) Qwen2.5-3B + LoRA sadeleştirme modülün.

- MOCK_MODE = True  -> Model yüklenmez, pipeline'ı hızlıca test etmek içindir.
- MOCK_MODE = False -> Kaggle'da eğittiğin gerçek LoRA modelini yükler.

Gerçek modele geçmek için:
  1. Kaggle'dan "osmanlica_lora_model" klasörünü indir
  2. MODEL_PATH değişkenine yolunu yaz
  3. MOCK_MODE = False yap
"""

MOCK_MODE = True

MODEL_PATH = "./models/osmanlica_lora_model"  # Kaggle'dan indirdiğin LoRA klasörü

PROMPT_TEMPLATE = """### Görev:
Aşağıdaki Osmanlı Türkçesi metnini günümüz Türkçesine sadeleştir.

### Osmanlıca:
{}

### Türkçe:
{}"""

_model = None
_tokenizer = None


def _load_real_model():
    global _model, _tokenizer
    if _model is not None:
        return

    print("[GERÇEK MOD] Qwen modeli yükleniyor...")
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    import torch

    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"[GERÇEK MOD] Kullanılan cihaz: {device}")

    base_model_name = "Qwen/Qwen2.5-3B-Instruct"
    _tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    ).to(device)

    _model = PeftModel.from_pretrained(base_model, MODEL_PATH).to(device)
    _model.eval()
    print("[GERÇEK MOD] Model yüklendi.")


def simplify(latin_ottoman_text: str) -> dict:
    """
    Girdi : Latin harfli Osmanlıca/eski Türkçe metin (str)
    Çıktı : {"text": günümüz Türkçesi (str), "mock": bool}
    """
    if MOCK_MODE:
        print("[MOCK] simplify() çağrıldı — gerçek Qwen modeli devrede değil")
        return {"text": f"(SADELEŞTİRİLMİŞ - MOCK): {latin_ottoman_text}", "mock": True}

    _load_real_model()
    import torch

    device = next(_model.parameters()).device
    prompt = PROMPT_TEMPLATE.format(latin_ottoman_text, "")
    inputs = _tokenizer([prompt], return_tensors="pt").to(device)

    outputs = _model.generate(
        **inputs,
        max_new_tokens=150,
        eos_token_id=_tokenizer.eos_token_id,
        pad_token_id=_tokenizer.eos_token_id,
    )
    full_text = _tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
    result = full_text.split("### Türkçe:")[-1].strip()
    result = result.split("###")[0].strip()
    result = result.split("\n\n")[0].strip()

    return {"text": result, "mock": False}