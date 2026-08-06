# Osmanlıca–Latin Harfleri Transliterasyon Modülü

## 1. Modülün Amacı

Bu modülün amacı, Arap harfleriyle yazılmış Osmanlı Türkçesi metinlerini tarihî dil özelliklerini koruyarak Latin harflerine aktarmaktır.

Modülün girdisi Arap harfli Osmanlıca metin, çıktısı ise Latin harfli tarihî Osmanlıca metindir.

Bu modül:

- Görüntü işleme yapmaz.
- OCR veya HTR işlemi gerçekleştirmez.
- Metni modern Türkçeye sadeleştirmez.
- Tarihî kelimeleri güncel karşılıklarıyla değiştirmez.

Örnek:

- Arap harfli kaynak: دولت عليه عثمانيه
- Transliterasyon: Devlet-i Aliyye-i Osmâniyye
- Modern Türkçe sadeleştirme: Osmanlı Devleti

“Osmanlı Devleti” çıktısı, transliterasyon değil sadeleştirme modülünün sorumluluğundadır.

## 2. Pipeline İçindeki Yeri

Projenin uçtan uca çalışma sırası şöyledir:

1. Belge görüntüsü sisteme yüklenir.
2. Görüntü iyileştirme modülü belgeyi temizler ve okunabilir hâle getirir.
3. OCR/HTR modülü görüntüdeki yazıyı Arap harfli Osmanlıca metne dönüştürür.
4. Transliterasyon modülü Arap harfli Osmanlıca metni Latin harfli tarihî Osmanlıcaya aktarır.
5. Sadeleştirme modülü Latin harfli tarihî metni modern Türkçeye dönüştürür.

Akış:

Belge görüntüsü → Görüntü iyileştirme → OCR/HTR → Arap harfli Osmanlıca → Transliterasyon → Latin harfli tarihî Osmanlıca → Modern Türkçe sadeleştirme

Fine-tuning aşamasında transliterasyon modülü, OCR modelinin tamamlanmasını beklemeden bağımsız Osmanlıca–Latin metin çiftleriyle eğitilebilir.

Pipeline entegrasyonu aşamasında ise OCR modelinin gerçek çıktısı transliterasyon modelinin girdisi olacaktır.

## 3. Model Adayları

### 3.1. mT5-small

İlk temel model adayı olarak `google/mt5-small` değerlendirilecektir.

mT5, metinden metne dönüşüm görevleri için kullanılan çok dilli encoder-decoder mimarisine sahip bir modeldir. Osmanlıca metnin Latin harflerine aktarılması da bir sequence-to-sequence görevi olarak ele alınabilir.

Avantajları:

- Metinden metne dönüşüm görevlerine uygundur.
- Çok dilli ön eğitimden yararlanır.
- Hugging Face Transformers kütüphanesiyle kullanılabilir.
- LoRA ile parametre-verimli fine-tuning yapılabilir.
- Küçük sürümü ilk deneyler için daha ulaşılabilir durumdadır.

Sınırlılıkları:

- Osmanlı Türkçesi için özel olarak önceden eğitilmiş değildir.
- Arap harfli Osmanlıca ile Latin harfli karşılığından oluşan paralel veriye ihtiyaç duyar.
- Küçük veri setlerinde ezberleme riski bulunabilir.

### 3.2. ByT5-small

İkinci model adayı olarak `google/byt5-small` değerlendirilecektir.

ByT5, alt kelime tokenları yerine UTF-8 baytları üzerinde çalışır. Bu özellik farklı alfabeleri, nadir karakterleri ve OCR kaynaklı karakter bozulmalarını işlemede avantaj sağlayabilir.

Muhtemel avantajları:

- Arap ve Latin alfabelerini doğrudan işleyebilir.
- Nadir karakterlere ve yazım çeşitliliğine dayanıklı olabilir.
- Transkripsiyon işaretlerini sabit bir kelime haznesine bağlı olmadan işleyebilir.
- OCR hataları içeren girdilerde alternatif bir model oluşturabilir.

Sınırlılıkları:

- Bayt dizileri daha uzun olabileceği için eğitim maliyeti artabilir.
- Çıkarım süresi mT5 modeline göre daha yüksek olabilir.
- Yerel cihazda yapılacak büyük eğitimler için donanım sınırı oluşabilir.

## 4. İlk Model Kararı ve Fine-Tuning Yaklaşımı

İlk pilot çalışma için aşağıdaki model yaklaşımı önerilmektedir:

- Temel model: `google/mt5-small`
- Fine-tuning yöntemi: LoRA
- Karşılaştırma modeli: `google/byt5-small`
- Görev türü: sequence-to-sequence transliterasyon

İlk model seçimi kesin ve nihai bir karar değildir. mT5-small ile çalışan bir temel sistem oluşturulduktan sonra aynı veri bölümleri kullanılarak ByT5-small ile karşılaştırmalı deney yapılacaktır.

### 4.1. LoRA Kullanımının Nedeni

LoRA yönteminde modelin bütün parametrelerini yeniden eğitmek yerine, modele eklenen az sayıdaki parametre güncellenir.

Bu yaklaşımın tercih edilme nedenleri:

- Tam fine-tuning yöntemine göre daha az bellek gerektirmesi.
- Eğitim süresini ve saklanan model dosyalarının boyutunu azaltması.
- Küçük ve orta büyüklükteki veri setleriyle pilot deney yapılmasını kolaylaştırması.
- Modelin önceden öğrenilmiş dil bilgisinin büyük bölümünü koruması.

İlk aşamada amaç en yüksek başarı skoruna ulaşmak değil; veri hazırlama, model eğitimi, tahmin ve değerlendirme adımlarının birlikte çalıştığını doğrulamaktır.

Asıl fine-tuning işlemine ancak transkripsiyon standardı ve kullanılacak paralel veri seti kesinleştirildikten sonra başlanacaktır.

## 5. Veri Seti Araştırması

### 5.1. Ottoman Turkish Place Names Gazetteer

Bu veri seti, Osmanlı arşiv kayıtlarından derlenmiş Arap harfli yer adları ile bunların Latin harfli karşılıklarını içeren özel amaçlı bir paralel korpustur.

Veri setinin özellikleri:

- Yaklaşık 20.000’den fazla yer adı çifti içerir.
- Arap harfli Osmanlıca kaynak ile Latin harfli hedef birlikte bulunur.
- JSONL biçiminde bir fine-tuning dosyası sunar.
- Tarihî şehir, kasaba, köy ve coğrafi adların aktarımında yararlı olabilir.
- CC BY-NC 4.0 lisansıyla yayımlanmıştır.

Avantajları:

- Doğrudan kaynak–hedef çiftleri içerir.
- Mevcut veri şemamıza dönüştürülmesi kolaydır.
- Özel adların ve yer adlarının doğru yazılmasına katkı sağlayabilir.

Sınırlılıkları:

- Yalnızca yer adlarına odaklanır.
- Fiil, tam cümle ve farklı metin türlerini yeterince temsil etmez.
- Tek başına kullanılırsa modelin genel Osmanlıca metinlerde başarılı olması beklenemez.
- Ticari olmayan kullanım şartı nedeniyle lisans uygunluğu ayrıca değerlendirilmelidir.

Karar:

Bu veri seti ana eğitim korpusu olarak değil, yer adları ve özel isimler için yardımcı veri kaynağı olarak değerlendirilecektir.

### 5.2. OpenITI-MAKHZAN Ottoman Lines

OpenITI-MAKHZAN Ottoman Lines, tarihî Osmanlıca belge satırlarının görüntülerini ve bu satırların Arap harfli ground-truth transkripsiyonlarını içeren bir veri setidir.

Veri setinin özellikleri:

- Toplam 3.654 satır düzeyinde görüntü–metin çifti içerir.
- Eğitim bölümünde 3.512 satır bulunmaktadır.
- Test bölümünde 142 farklı dağılım örneği bulunmaktadır.
- Metinler Osmanlı Türkçesinin Arap harfli biçimindedir.
- Temel kullanım amacı OCR ve HTR modellerinin eğitilmesi ve değerlendirilmesidir.

Avantajları:

- Osmanlıca belge görüntüleri için doğrulanmış satır metinleri sunar.
- Zehra tarafından geliştirilen OCR/HTR modülü için doğrudan kullanılabilir.
- İleride OCR çıktısı ile gerçek metin arasındaki farkların incelenmesini sağlayabilir.

Sınırlılıkları:

- Latin harfli hedef metin içermez.
- Bu nedenle mevcut hâliyle transliterasyon fine-tuning verisi değildir.

Karar:

Bu veri setinin transliterasyon modülünde kullanılabilmesi için her Arap harfli satıra, seçilen transkripsiyon standardına uygun Latin harfli hedef eklenmesi gerekir.

### 5.3. DUDU Treebank

DUDU, Universal Dependencies biçiminde hazırlanmış bir Osmanlı Türkçesi treebank veri setidir.

Veri setinin özellikleri:

- 1.064 otomatik etiketlenmiş ve daha sonra elle düzeltilmiş cümle içerir.
- Osmanlı Türkçesi için IJMES transliterasyon alfabesini kullanır.
- Sözcük türü, biçimbilim ve sözdizimi bilgileri içerir.
- Metinler farklı akademik ve edebî kaynaklardan derlenmiştir.

Avantajları:

- Uzmanlar tarafından düzeltilmiş Latin harfli Osmanlıca cümleler içerir.
- Transkripsiyon alfabesi ve yazım standardını incelemek için kullanılabilir.
- Model çıktılarının tarihî dil özelliklerini koruyup korumadığını değerlendirmede yararlı olabilir.

Sınırlılıkları:

- Arap harfli kaynak metin ile Latin harfli hedef metni birlikte sunan paralel bir veri seti değildir.
- Bu nedenle mevcut biçimiyle supervised transliterasyon fine-tuning verisi olarak kullanılamaz.
- Cümle sayısı ana eğitim veri seti için sınırlıdır.

Karar:

DUDU doğrudan ana fine-tuning verisi olarak değil, transkripsiyon standardının incelenmesi, Latin hedef tarafının kontrolü ve bağımsız değerlendirme örneklerinin hazırlanması için kullanılacaktır.

### 5.4. Latin-transliterated Ottoman Turkish Corpus — LATOC

LATOC, farklı dönemlerden Osmanlı Türkçesi eserlerin Latin harflerine aktarılmış metinlerini içeren geniş bir tarihî Türkçe korpusudur.

Veri setinin özellikleri:

- 15. yüzyıldan 20. yüzyıla kadar uzanan metinler içerir.
- 143 Osmanlı Türkçesi kitaptan oluşur.
- Yaklaşık 13,25 milyon Latin harfli kelime içerir.
- Farklı dönem, yazar ve metin türlerinden tarihî dil örnekleri sağlar.

Avantajları:

- Latin harfli tarihî Osmanlıca açısından çok geniş bir dil kaynağıdır.
- Tarihî kelime biçimlerini ve cümle yapılarını incelemeye yardımcı olabilir.
- Hedef tarafı yazım tutarlılığı ve sözcük dağarcığı araştırmalarında kullanılabilir.
- İleride hedef tarafı dil modeli veya veri doğrulama çalışmaları için yararlı olabilir.

Sınırlılıkları:

- Arap harfli kaynak metinler ile Latin harfli karşılıkları satır bazında eşlenmiş değildir.
- Bu nedenle mevcut biçimiyle doğrudan source_ottoman–target_latin eğitim çifti sağlamaz.
- Farklı eserlerde kullanılan Latinleştirme tercihleri birbiriyle tamamen aynı olmayabilir.

Karar:

LATOC doğrudan ana paralel eğitim verisi olarak değil, Latin hedef tarafının incelenmesi, tarihî kelime haznesinin oluşturulması ve transkripsiyon standardının kontrol edilmesi amacıyla değerlendirilecektir.

## 6. Eğitim Verisinin Yapısı

Transliterasyon modeli görüntü dosyalarıyla değil, Arap harfli Osmanlıca metin ile Latin harfli karşılığından oluşan metin–metin çiftleriyle eğitilecektir.

Her eğitim örneği temel olarak şu iki alanı içermelidir:

- `source_ottoman`: Arap harfli Osmanlıca kaynak metin
- `target_latin`: Aynı metnin Latin harfli tarihî aktarımı

Örnek:

```json
{
  "source_ottoman": "كتاب",
  "target_latin": "kitâb"
}
```

Proje kapsamında daha ayrıntılı veri takibi yapılabilmesi için her satırda ek metadata alanları da tutulacaktır.

Önerilen tam veri şeması:

```json
{
  "id": "doc001_line001",
  "document_id": "doc001",
  "source_ottoman": "كتاب",
  "target_latin": "kitâb",
  "scheme": "project_v1",
  "domain": "prose",
  "quality": "verified",
  "source_name": "manual"
}
```

Alanların açıklamaları:

- `id`: Her örnek için benzersiz kimlik.
- `document_id`: Örneğin ait olduğu belge veya eser kimliği.
- `source_ottoman`: Arap harfli Osmanlıca kaynak.
- `target_latin`: Latin harfli tarihî karşılık.
- `scheme`: Kullanılan transkripsiyon standardı.
- `domain`: Metnin türü veya alanı.
- `quality`: Verinin doğrulama seviyesi.
- `source_name`: Verinin elde edildiği kaynak.

Veri dosyası JSONL biçiminde saklanacaktır. JSONL formatında her satır ayrı bir JSON nesnesidir.

Planlanan ham veri dosyası:

`data/raw/transliteration/pairs.jsonl`

Bu dosyada görüntü yolu bulunması zorunlu değildir. Çünkü transliterasyon modülü doğrudan metin–metin dönüşümü yapmaktadır.

## 7. Ground-Truth Verinin Hazırlanması

Hazır ve yeterli büyüklükte Osmanlıca–Latin paralel korpus bulunamazsa eğitim verisi elle veya yarı otomatik olarak hazırlanacaktır.

Ground-truth hazırlama süreci şu şekilde olacaktır:

1. Arap harfli Osmanlıca metin kaynaktan alınır.
2. Kaynak metin değiştirilmeden `source_ottoman` alanına kaydedilir.
3. Metin, belirlenen transkripsiyon standardına göre Latin harflerine aktarılır.
4. Latin harfli karşılık `target_latin` alanına yazılır.
5. Hazırlanan çift ikinci bir kişi veya alan uzmanı tarafından kontrol edilir.
6. Belge kimliği, kaynak adı, metin türü ve kalite seviyesi eklenir.
7. Doğrulanan örnek JSONL dosyasına eklenir.

Önerilen kalite seviyeleri:

- `verified`: Alan uzmanı veya ikinci bir kişi tarafından doğrulanmış veri.
- `reviewed`: Bir kişi tarafından kontrol edilmiş ancak ikinci doğrulaması tamamlanmamış veri.
- `draft`: Henüz kontrol edilmemiş taslak veri.
- `synthetic`: Otomatik bir yöntemle oluşturulmuş veri.

Ana test kümesinde yalnızca `verified` seviyesindeki örneklerin kullanılması önerilmektedir.

Elle hazırlanmış veri ile otomatik üretilmiş veri birbirinden ayrı tutulmalıdır. Sentetik veri kullanılması hâlinde bu durum `quality` ve `source_name` alanlarında açıkça belirtilmelidir.

Zehra tarafından geliştirilen OCR modelinin çıktıları bu aşamadaki ana eğitim verisi değildir. İrem kendi modelini önceden hazırlanmış veya elle doğrulanmış ground-truth metin çiftleriyle bağımsız olarak eğitebilir.

## 8. Transkripsiyon Standardı

Model eğitilmeden önce bütün veri setinde kullanılacak tek bir transkripsiyon standardı belirlenmelidir.

Aynı Osmanlıca kelimenin veri setinde farklı biçimlerde yazılması modelin çelişkili örnekler öğrenmesine neden olur.

Örneğin aşağıdaki hedef biçimlerden yalnızca biri seçilmelidir:

- `kitab`
- `kitâb`
- `kitāb`

Bu nedenle ilk taslak standart `project_v1` olarak adlandırılmıştır.

### 8.1. Karar Verilmesi Gereken Noktalar

- Uzun ünlülerin â, î ve û ile gösterilip gösterilmeyeceği.
- Ayn harfinin hangi işaretle gösterileceği.
- Hemzenin hangi işaretle gösterileceği.
- Arapça ve Farsça kökenli özel ünsüzlerin nasıl aktarılacağı.
- İzafet yapılarının nasıl yazılacağı.
- Büyük ve küçük harf kullanımının nasıl uygulanacağı.
- Noktalama işaretlerinin korunup korunmayacağı.
- Birleşik ve ayrı yazılan kelimelerin standardı.
- Özel adların yazım biçimi.

### 8.2. Project V1 İçin İlk Taslak Kurallar

- Tarihî kelime biçimleri korunacaktır.
- Modern Türkçeye sadeleştirme yapılmayacaktır.
- Uzun ünlüler â, î ve û ile gösterilecektir.
- İzafet yapıları korunacaktır.
- Unicode metinler NFC biçiminde normalleştirilecektir.
- Aynı kelime veri seti boyunca tek biçimde yazılacaktır.
- Kaynakta güvenilir noktalama varsa hedefte korunacaktır.
- Şüpheli okumalar doğrudan eğitim verisine eklenmeyecektir.

### 8.3. Standardın Kesinleştirilmesi

Project v1 standardı ekip üyeleri ve danışman tarafından onaylandıktan sonra ana veri hazırlama süreci başlayacaktır.

Standart değişirse daha önce hazırlanmış bütün hedef metinlerin aynı kurallara göre yeniden kontrol edilmesi gerekir.

## 9. Veri Bölme Yöntemi

Veri seti eğitim, doğrulama ve test olmak üzere üç bölüme ayrılacaktır.

Planlanan oranlar:

- Eğitim kümesi: yüzde 80
- Doğrulama kümesi: yüzde 10
- Test kümesi: yüzde 10

Veri mümkün olduğunca satır bazında rastgele değil, belge bazında bölünecektir.

Aynı esere veya belgeye ait satırların hem eğitim hem test kümesinde bulunması veri sızıntısına neden olabilir.

Bu nedenle bölme işlemi `document_id` alanı kullanılarak yapılacaktır.

Örnek:

- `doc001` belgesinin bütün satırları yalnızca eğitim kümesinde bulunur.
- `doc002` belgesinin bütün satırları yalnızca doğrulama kümesinde bulunur.
- `doc003` belgesinin bütün satırları yalnızca test kümesinde bulunur.

Test kümesi model eğitimi sırasında kullanılmayacak ve yalnızca nihai değerlendirme aşamasında açılacaktır.

## 10. Değerlendirme Metrikleri

Transliterasyon modelinin başarısı yalnızca genel cümle benzerliğiyle değil, karakter ve kelime düzeyindeki hatalarla da ölçülmelidir.

### 10.1. CER — Character Error Rate

CER, model çıktısındaki karakter ekleme, silme ve değiştirme hatalarını ölçer.

Transliterasyon karakter düzeyinde hassas bir görev olduğu için ana değerlendirme metriği olarak kullanılacaktır.

CER değerinin düşük olması daha iyi sonuç anlamına gelir.

### 10.2. WER — Word Error Rate

WER, model çıktısındaki kelime düzeyindeki ekleme, silme ve değiştirme hatalarını ölçer.

Kelime sınırları, izafetler ve ayrı-bitişik yazım hatalarının değerlendirilmesinde yararlıdır.

WER değerinin düşük olması daha iyi sonuç anlamına gelir.

### 10.3. Exact Match

Exact Match, model çıktısının hedef metinle karakter karakter tamamen aynı olup olmadığını ölçer.

Bu metrik çok katıdır; tek bir noktalama veya uzun ünlü farkı bile örneğin başarısız sayılmasına neden olur.

### 10.4. chrF ve chrF++

chrF, tahmin ile hedef arasındaki karakter n-gram benzerliğini ölçer.

chrF++, karakter benzerliğine kelime n-gram bilgisini de ekler.

Bu metrikler yazım farklılıklarını ve kısmi doğruluğu göstermede yararlıdır.

### 10.5. BLEU

BLEU, model çıktısı ile hedef metin arasındaki n-gram benzerliğini ölçer.

Transliterasyon için tek başına yeterli değildir; ikincil bir metrik olarak raporlanacaktır.

### 10.6. Değerlendirme Önceliği

Planlanan metrik sırası:

1. CER
2. Exact Match
3. chrF veya chrF++
4. WER
5. BLEU

Değerlendirme sırasında yalnızca toplam skorlar değil, hatalı örnekler de ayrı bir hata analizi dosyasında incelenecektir.

## 11. Deney Planı

### 11.1. Smoke Test

İlk deneyde amaç yüksek doğruluk elde etmek değil, bütün teknik zincirin çalıştığını doğrulamaktır.

Plan:

- 100–300 doğrulanmış Osmanlıca–Latin metin çifti hazırlanır.
- mT5-small modeli LoRA yöntemiyle kısa süre eğitilir.
- Veri okuma, tokenization, eğitim, tahmin ve metrik hesaplama adımları test edilir.
- Eğitim 1 veya 2 epoch ile sınırlandırılır.

### 11.2. Pilot Fine-Tuning

Smoke test başarılı olduktan sonra daha büyük ve çeşitli bir veri setiyle pilot eğitim yapılacaktır.

Plan:

- 2.000–5.000 doğrulanmış paralel çift kullanılır.
- mT5-small ve ByT5-small aynı veri bölümleri üzerinde karşılaştırılır.
- CER, WER, Exact Match, chrF ve BLEU skorları hesaplanır.
- Hata türleri sınıflandırılır.

### 11.3. Hata Analizi

Model hataları aşağıdaki başlıklarda incelenecektir:

- Uzun ünlü hataları
- Ayn ve hemze aktarım hataları
- İzafet hataları
- Özel ad hataları
- Kelime ayırma ve birleştirme hataları
- Noktalama hataları
- Arapça ve Farsça kökenli harflerin aktarım hataları
- Modelin kelimeyi modernleştirmesi veya sadeleştirmesi

### 11.4. OCR Gürültüsü Deneyi

İlk eğitim temiz ground-truth Osmanlıca metinlerle yapılacaktır.

Daha sonraki entegrasyon aşamasında Zehra tarafından geliştirilen OCR modelinin gerçek çıktıları transliterasyon modeline verilecektir.

Bu deneyde iki farklı giriş türü karşılaştırılacaktır:

- Temiz ve doğrulanmış Arap harfli metin
- OCR hataları içeren Arap harfli metin

Böylece OCR hatalarının transliterasyon başarısını ne ölçüde düşürdüğü analiz edilecektir.

## 12. İlk Aşamanın Sonucu

Literatür ve veri seti araştırması sonucunda ilk teknik yaklaşım şu şekilde belirlenmiştir:

- Görev: Arap harfli Osmanlıca metni Latin harfli tarihî Osmanlıcaya aktarmak.
- Temel model: `google/mt5-small`.
- Fine-tuning yaklaşımı: LoRA.
- Karşılaştırma modeli: `google/byt5-small`.
- Eğitim verisi: doğrulanmış Osmanlıca–Latin metin çiftleri.
- Ana veri biçimi: JSONL.
- Ana değerlendirme metriği: CER.
- Yardımcı metrikler: WER, Exact Match, chrF ve BLEU.
- Veri bölme yöntemi: belge düzeyinde train, validation ve test ayrımı.

Fine-tuning işlemine başlamadan önce tamamlanması gereken işler:

- Transkripsiyon standardının ekip ve danışman tarafından onaylanması.
- Ana paralel veri kaynağının kesinleştirilmesi.
- Veri kaynaklarının lisanslarının kontrol edilmesi.
- İlk 100–300 doğrulanmış örneğin hazırlanması.
- Veri doğrulama ve kalite kontrol sürecinin belirlenmesi.

Bu aşamada transliterasyon modülünün Zehra tarafından geliştirilen OCR modelini beklemesine gerek yoktur. Model, bağımsız olarak hazırlanmış ground-truth metin çiftleriyle eğitilebilir.
