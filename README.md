# Virgil Registry API

This is the key part of the verification service. It is a separate worker because this will receive the bulk of traffic and pages is still limited to 100k executions daily.

## Deploying

Copy `wrangler.toml.example` to `wrangler.toml`, fill out the fields, edit to your liking, and deploy with `npm run build && wrangler publish dist\src.js`
