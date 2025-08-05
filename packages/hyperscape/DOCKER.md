# 🐳 Docker Deployment

The project can be run using Docker. Make sure you have Docker installed on your system.

1. Build the image and run the container:

```bash
docker build -t hyperscapedemo . && docker run -d -p 4444:4444 \
  -v "$(pwd)/src:/app/src" \
  -v "$(pwd)/world:/app/world" \
  -v "$(pwd)/.env:/app/.env" \
  -e DOMAIN=demo.hyperscape.host \
  -e PORT=4444 \
  -e ASSETS_DIR=/world/assets \
  -e PUBLIC_WS_URL=https://demo.hyperscape.host/ws \
  -e PUBLIC_API_URL=https://demo.hyperscape.host/api \
  -e PUBLIC_ASSETS_URL=https://demo.hyperscape.host/assets \
  hyperscapedemo
```

This command:
- Builds the Docker image tagged as 'hyperscapedemo'
- Mounts local src/, world/ directories and .env file into the container
- Exposes port 3000
- Sets up required environment variables
- Runs the container in detached mode (-d)

Note: Adjust the URLs and domain according to your specific setup.