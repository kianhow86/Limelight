# Limelight — deploy

This folder is ready to deploy. Do NOT drag-and-drop it into the Netlify
dashboard — the storage (Netlify Blobs) only wires up on a Git or CLI deploy.
Use one of the two methods below.

## Method A — GitHub (same as TM Companion)
1. Create a new GitHub repo and push the CONTENTS of this folder to it
   (index.html and package.json at the root, the netlify folder alongside).
2. Netlify → Add new site → Import an existing project → pick the repo.
   Build command: leave blank.  Publish directory: .  (netlify.toml sets this.)
3. Netlify → Site configuration → Environment variables, add:
     ANTHROPIC_KEY = your Anthropic key
     ADMIN_SECRET  = a long random string (your password for issuing codes)
     OPENAI_KEY    = (optional) only for hosted AI image generation
4. Trigger a redeploy so the functions pick up the variables.

## Method B — Netlify CLI
1. Install: npm i -g netlify-cli
2. In this folder: npm install   (creates the lockfile)
3. netlify deploy --prod   (follow prompts to link/create the site)
4. Set the same environment variables (step 3 above), redeploy.

## Test it works
Functions tab should list `generate` and `admin`. Then:

Mint a code:
  curl -s https://YOURSITE.netlify.app/.netlify/functions/admin \
    -H 'Content-Type: application/json' \
    -d '{"secret":"YOUR_ADMIN_SECRET","action":"add","name":"Me","limit":60}'

Test generate with the returned code:
  curl -s https://YOURSITE.netlify.app/.netlify/functions/generate \
    -H 'Content-Type: application/json' \
    -d '{"accessCode":"LL-XXXX-XXXX","kind":"text","payload":{"model":"claude-sonnet-4-6","max_tokens":50,"messages":[{"role":"user","content":"say hi in 3 words"}]}}'

A reply with "used":1 means the whole backend works. Then come back and the
HTML gets wired to use it (remove keys, add the access-code screen).
