# RentalOS

Наеми, сметки и справки за частни наемодатели с 1–20 имота.

## Стартиране

```bash
npm install
cp .env.example .env.local   # попълни стойностите от Supabase
npm run dev
```

## Миграции на базата

Схемата се води в `supabase/migrations/`. Всяка миграция се пуска веднъж и
базата помни коя е минала в таблицата `schema_migrations`.

```bash
npm run db:pending
```

Командата показва кои миграции са минали и кои предстоят, и записва
предстоящите в **`supabase/PENDING.sql`**.

За да ги приложиш:

1. Отвори `supabase/PENDING.sql`
2. Маркирай всичко (Cmd+A) и копирай (Cmd+C)
3. Supabase → **SQL Editor** → **New query** → постави → **Run**
4. Пусни `npm run db:pending` пак — трябва да каже, че базата е в крак

Файлът се генерира наново при всяко пускане и не се комитва.

## Проверки

```bash
npm run build     # включва проверка на типовете
npm run lint
```
