# GieesK Recipes — Setup Status

## ✅ Completed
- Supabase project created (qwlrcjwqjlzrkdhmwqgz)
- API keys connected in js/supabase.js
- Database tables created (profiles, saved_recipes, meal_plans, reviews, shopping_list_items)
- Row Level Security enabled on all tables
- Email sign-in enabled
- Google sign-in enabled and configured

## 🔲 Optional: Apple Sign-In
Apple requires a paid Apple Developer account ($99/year).
If you want it later:
1. Go to https://developer.apple.com
2. Create a Services ID (e.g. com.gieeskrecipes.app)
3. Enable Sign In with Apple
4. Add redirect URI: https://qwlrcjwqjlzrkdhmwqgz.supabase.co/auth/v1/callback
5. Create a Private Key (.p8 file)
6. In Supabase → Authentication → Providers → Apple
7. Fill in Services ID, Team ID, Key ID, and paste .p8 file contents

## ✅ Deployed
Live on Cloudflare Pages: https://gieesk.com

Supabase Auth → URL Configuration should point here:
- Site URL: https://gieesk.com
- Redirect URLs: https://gieesk.com/*

(If a custom domain is connected later, update both to match and add
the new domain to Google Cloud OAuth below.)

## Google Cloud OAuth — add your live domain
Go to Google Cloud Console → Credentials → your GieesK Recipes OAuth client
and add:
- Authorised JavaScript origins: https://gieesk.com
- Authorised redirect URIs: https://qwlrcjwqjlzrkdhmwqgz.supabase.co/auth/v1/callback
