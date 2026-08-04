import json
import yaml
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
    DataCollatorForSeq2Seq,
)

# BURAYI VERİLERİNİN OLDUĞU KLASÖR YOLU YAP
CONFIG_PATH = "/Users/zeynep/proje/configs/simplification.yaml"
DATA_DIR = "/Users/zeynep/proje/verilerim" 
MODEL_OUTPUT_DIR = "/Users/zeynep/proje/models/turna_simplification"

def load_jsonl(path):
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            records.append(json.loads(line))
    return records

def main():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = yaml.safe_load(f)["simplification"]
    
    model_name = config["model_name"]
    max_source_length = config.get("max_source_length", 256)
    max_target_length = config.get("max_target_length", 256)

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

    # Veri yolu buraya yansıyor
    train_records = load_jsonl(f"{DATA_DIR}/simplification_train.jsonl")
    val_records = load_jsonl(f"{DATA_DIR}/simplification_val.jsonl")
    
    train_dataset = Dataset.from_list(train_records)
    val_dataset = Dataset.from_list(val_records)

    def preprocess(batch):
        model_inputs = tokenizer(batch["input"], max_length=max_source_length, truncation=True)
        labels = tokenizer(text_target=batch["target"], max_length=max_target_length, truncation=True)
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    train_tokenized = train_dataset.map(preprocess, batched=True, remove_columns=train_dataset.column_names)
    val_tokenized = val_dataset.map(preprocess, batched=True, remove_columns=val_dataset.column_names)
    
    data_collator = DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model)

    training_args = Seq2SeqTrainingArguments(
        output_dir=MODEL_OUTPUT_DIR,
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=3e-5,
        per_device_train_batch_size=2,
        per_device_eval_batch_size=2,
        gradient_accumulation_steps=4,
        num_train_epochs=8,
        predict_with_generate=True,
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_tokenized,
        eval_dataset=val_tokenized,
        tokenizer=tokenizer,
        data_collator=data_collator,
    )

    trainer.train()
    trainer.save_model(MODEL_OUTPUT_DIR)
    tokenizer.save_pretrained(MODEL_OUTPUT_DIR)

if __name__ == "__main__":
    main()