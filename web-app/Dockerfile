# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:pre

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Write nginx config inline (avoids build-context path issues)
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX_EOF'
server {
    listen PORT_PLACEHOLDER;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass https://game-ddz-server-production.up.railway.app;
        proxy_http_version 1.1;
        proxy_set_header Host game-ddz-server-production.up.railway.app;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1024;
}
NGINX_EOF

# Railway injects $PORT at runtime; replace the placeholder before starting nginx
CMD ["/bin/sh", "-c", "sed -i 's/PORT_PLACEHOLDER/'\"$PORT\"'/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
