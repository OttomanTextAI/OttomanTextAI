# Transliterasyon Ground-Truth Veri Kuralları

## Temel görev

Temiz ve eksiksiz Arap harfli Osmanlı Türkçesi metni, aynı metnin Latin harfli tarihî biçimine aktarılır.

## Eğitim verisine kabul edilen örnekler

- Kaynak metin eksiksiz ve okunaklı olmalıdır.
- Kaynak metin Arap harfli Osmanlı Türkçesi olmalıdır.
- Latin hedef aynı metnin transliterasyonu olmalıdır.
- Modern Türkçe sadeleştirme yapılmamalıdır.
- Eksik harf veya kelime tahmini yapılmamalıdır.
- OCR çıktısı doğrudan ground truth olarak kullanılmamalıdır.
- Kaynak ve hedef aynı metin parçasına ait olmalıdır.
- Her örneğin kaynağı belirtilmelidir.

## Eğitim verisine alınmayacak örnekler

- Silik veya eksik metinler.
- Okunuşundan emin olunmayan kelimeler.
- Otomatik OCR çıktıları.
- Modern Türkçeye çevrilmiş veya sadeleştirilmiş metinler.
- Kaynağı bilinmeyen metinler.
- Transkripsiyon standardı belirsiz örnekler.

## Dosya kullanımı

- pairs.jsonl yalnızca doğrulanmış eğitim çiftlerini içerir.
- draft_pairs.jsonl henüz kontrol edilmemiş çiftleri içerir.
- sources.csv bütün kaynakların bibliyografik bilgisini içerir.
