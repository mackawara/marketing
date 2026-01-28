# Stop and remove the existing container if running
stop:
	docker stop marketing || true
	docker rm marketing || true

# Remove the existing image
clean:
	docker rmi marketing || true

# Build the Docker image with no cache
build: stop clean
	docker buildx build --platform linux/amd64  --load --no-cache -t marketing .

# Build the Docker image with cache
build-cache: stop
	docker buildx build --platform linux/amd64 --load -t marketing .

# Run the container, ensuring the correct port and env file
run: stop
	docker run --rm --name marketing --env-file .env -p 4000:4000 marketing

# Run the container interactively for debugging
run-it: stop
	docker run --rm -it marketing sh
prune : stop 
	docker system prune -a

push:
	docker tag marketing mackawara/marketing:latest
	docker push mackawara/marketing:latest

status:
	git status
