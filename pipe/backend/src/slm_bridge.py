import json

_TOK = None
_MODEL = None
_DEVICE = None


def init(model_name="google/gemma-3-1b-it", device=None):
    global _TOK, _MODEL, _DEVICE
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    if device is None or device == "":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    _DEVICE = device
    _TOK = AutoTokenizer.from_pretrained(model_name)
    _MODEL = AutoModelForCausalLM.from_pretrained(model_name)
    _MODEL.to(_DEVICE)
    _MODEL.eval()
    return json.dumps({
        "ok": True,
        "model": model_name,
        "device": _DEVICE,
        "vocab_size": _TOK.vocab_size,
    })


def warmup():
    _ = generate("You are a helper.", json.dumps({"q": "hello"}), 8)
    return json.dumps({"ok": True})


def generate(system_prompt, user_context_json, max_new_tokens=320):
    import torch
    assert _MODEL is not None, "SLM not initialized; call init() first."
    user_content = (
        "Use ONLY the facts in the following JSON context. "
        "Do not invent or speculate. Context:\n\n" + user_context_json
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    inputs = _TOK.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(_MODEL.device)
    with torch.no_grad():
        outputs = _MODEL.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=_TOK.eos_token_id,
        )
    generated = outputs[0][inputs["input_ids"].shape[-1]:]
    return _TOK.decode(generated, skip_special_tokens=True).strip()


def health():
    return json.dumps({
        "loaded": _MODEL is not None,
        "device": _DEVICE,
    })
