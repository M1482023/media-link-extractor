# Media Link Extractor Actor

Apify Actor שמשתמש בדפדפן וירטואלי (Playwright) לחילוץ קישורי מדיה מכל אתר. ה-Actor מדמה לחיצה על F12 כדי למצוא קישורי וידאו בדף.

## תכונות

- 🌐 עובד עם כל אתר (YouTube, Vimeo, Facebook, TikTok, Instagram ועוד)
- 🎯 מחלץ קישורי וידאו, אודיו ו-iframe
- 🔍 מחפש קישורי מדיה בתוך סקריפטים ותכונות data
- 🍪 תמיכה בעוגיות לאימות
- 🌍 תמיכה בפרוקסי של Apify
- ⚡ מהיר ויעיל עם Playwright

## שדות קלט

- **url** (חובה): כתובת הדף לחילוץ קישורי מדיה
- **cookies** (אופציונלי): עוגיות בפורמט Netscape לאימות
- **proxyConfiguration** (אופציונלי): הגדרות פרוקסי
- **waitForVideo** (אופציונלי): לחכות לטעינת אלמנט וידאו (ברירת מחדל: true)
- **timeout** (אופציונלי): זמן מקסימלי לטעינת דף בשניות (ברירת מחדל: 30)

## פורמט עוגיות

העוגיות צריכות להיות בפורמט Netscape:

```
# Netscape HTTP Cookie File
.domain.com	TRUE	/	FALSE	1735689600	NAME	VALUE
```

## שימוש בפרוקסי של Apify

ה-Actor תומך בפרוקסי המובנה של Apify. הפרוקסי מוגדר אוטומטית דרך שדה הקלט `proxyConfiguration`:

```json
{
  "url": "https://example.com/video",
  "proxyConfiguration": {
    "useApifyProxy": true,
    "groups": ["RESIDENTIAL"],
    "countryCode": "US"
  }
}
```

### אפשרויות פרוקסי זמינות:

- **useApifyProxy**: הפעלת פרוקסי של Apify
- **groups**: קבוצות פרוקסי (למשל: RESIDENTIAL, DATACENTER)
- **countryCode**: קוד מדה (למשל: US, GB, IL)
- **proxyUrls**: כתובות פרוקסי מותאמות אישית

## דוגמה להרצה

```json
{
  "url": "https://www.youtube.com/watch?v=example",
  "cookies": "# Netscape HTTP Cookie File\n...",
  "waitForVideo": true,
  "timeout": 30,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "countryCode": "US"
  }
}
```

## פלט

ה-Actor מוציא:
- **Dataset**: נתונים עם כל קישורי המדיה שנמצאו
- **Key-Value Store**: 
  - `media-links`: רשימת קישורי המדיה
  - `original-url`: הכתובת המקורית

### מבנה הפלט

```json
{
  "url": "https://example.com/video",
  "mediaLinks": [
    {
      "type": "video",
      "url": "https://example.com/video.mp4",
      "method": "video.src"
    },
    {
      "type": "audio",
      "url": "https://example.com/audio.mp3",
      "method": "audio.src"
    }
  ],
  "proxyUsed": "http://proxy.apify.com:8000",
  "timestamp": "2026-08-30T17:00:00.000Z"
}
```

## התקנה והרצה מקומית

```bash
# התקנת תלויות
npm install

# הרצה מקומית
apify run
```

## העלאה ל-Apify

```bash
# התחברות ל-Apify
apify login

# העלאת ה-Actor
apify push
```

## שיטות חילוץ נתמכות

ה-Actor מחפש קישורי מדיה במספר דרכים:

1. **אלמנטי video**: מחלץ `src` ו-`currentSrc` מתגי `<video>`
2. **אלמנטי source**: מחלץ קישורים מתגי `<source>` בתוך וידאו
3. **אלמנטי audio**: מחלץ קישורים מתגי `<audio>`
4. **אלמנטי iframe**: מחלץ קישורים מתגי `<iframe>`
5. **תכונות data**: מחפש קישורים בתכונות כמו `data-src`, `data-url`
6. **סקריפטים**: מחפש דפוסי קישורי וידאו בתוך סקריפטים מוטמעים

## דרישות מערכת

- Node.js 18+
- Apify CLI (להרצה מקומית)
- חשבון Apify (להרצה בענן)

## רישיון

ISC
