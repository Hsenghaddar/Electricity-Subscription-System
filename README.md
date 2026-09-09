# مصلحة اشتراك بشعرون

تطبيق Windows مكتبي يعمل دون إنترنت باستخدام Electron وJavaScript وSQLite.

## التشغيل أثناء التطوير

```powershell
npm install
npm start
```

## التحقق والبناء

```powershell
npm run check
npm run build
npm run dist
```

ينشئ الأمر الأخير ملف تثبيت Windows داخل مجلد `release`.

## مكان البيانات

يحفظ التطبيق قاعدة البيانات `ishtirak.sqlite` داخل مجلد بيانات التطبيق الخاص بمستخدم Windows، وليس داخل مجلد التثبيت. هذا يحافظ على البيانات عند تحديث التطبيق.
