# Overview
Garfana is a fast and open source client area for Pterodactyl Panel.

# Features
- Resource Management (Use it to create servers, etc)
- Coins (AFK Page earning, Linkvertise earning, Staking, etc.)
- Payments (Stripe for buying coins)
- Coupons (Gives resources & coins to a user)
- Servers (create, view, edit servers)
- Login Queue (prevent overload)
- User System (auth, regen password, etc)
- Store (buy resources with coins)
- Dashboard (view resources)
- Admin (set/add/remove coins & resources, create/revoke coupons)
- API (for bots & other things)

# Install guide

Warning: You need Pterodactyl already set up on a domain for Garfana to work
1. Upload the file above onto a Pterodactyl Bun server [Download the egg from Zastinian GitHub Repository](https://github.com/Zastinian/eseggs/blob/master/bun/egg-bun.json)
2. Unarchive the file and set the server to use Bun latest
3. Configure config.toml (specifically panel domain/apikey and discord auth settings for it to work)
4. Start the server
5. Login to your DNS manager, point the domain you want your dashboard to be hosted on to your VPS IP address. (Example: dashboard.domain.com 192.168.0.1)
6. Run `apt install nginx && apt install certbot` on the vps
7. Run `ufw allow 80` and `ufw allow 443` on the vps
8. Run `certbot certonly -d <Your Garfana Domain>` then do 1 and put your email
9. Run `nano /etc/nginx/sites-enabled/garfana.conf`
10. Paste the configuration at the bottom of this and replace with the IP of the pterodactyl server including the port and with the domain you want your dashboard to be hosted on.
11. Run `systemctl restart nginx` and try open your domain.

# Ngnix Proxy Config

```ngnix
# ----------------------------
# HTTP → HTTPS Redirect
# ----------------------------
server {
    listen 80;
    server_name your-domain.com;

    return 301 https://$host$request_uri;
}

# ----------------------------
# HTTPS Server
# ----------------------------
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL (Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

       location /api/afk/ws {
        proxy_pass http://127.0.0.1:PORT/api/afk/ws;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400;
    }

      location ~ ^/api/server/[^/]+/ws$ {
        proxy_pass http://127.0.0.1:PORT;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400;
    }

      location / {
        proxy_pass http://127.0.0.1:PORT;
        proxy_http_version 1.1;

        proxy_buffering off;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

# License
Licensed under MIT. Chle & contributors. All rights reserved.

