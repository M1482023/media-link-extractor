# Media Link Extractor Actor - Agent Instructions

## Project Overview
Apify Actor שמשתמש בדפדפן וירטואלי (Playwright) לחילוץ קישורי מדיה מכל אתר. מדמה לחיצה על F12 כדי למצוא קישורי וידאו בדף.

## Development Commands
- התקנת תלויות: `npm install`
- הרצה מקומית: `apify run`
- העלאה ל-Apify: `apify push`

## Key Files
- `src/main.js` - הקוד הראשי של ה-Actor
- `.actor/input_schema.json` - סכמת הקלט
- `.actor/actor.json` - קונפיגורציה של ה-Actor
- `.actor/Dockerfile` - הגדרות המכל (container)

## Important Notes
- ה-Actor משתמש ב-Playwright עם Chromium לאוטומציית דפדפן
- תומך בפרוקסי של Apify דרך `Actor.createProxyConfiguration()`
- מחלץ קישורי מדיה במספר שיטות: אלמנטי video/audio, תכונות data, סקריפטים מוטמעים
- עוגיות צריכות להיות בפורמט Netscape
- הלוגים מופיעים בצורה מפורטת עם אמוג'ים
- הפרוקסי מוגדר אוטומטית מה-input schema דרך השדה `proxyConfiguration`
