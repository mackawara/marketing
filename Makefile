# Stop and remove the existing container if running
stop:
	docker stop marketing || true
	docker rm marketing || true

# Remove the existing image
clean:
	docker rmi marketing || true

# Build the Docker image with no cache (for deployment - linux/amd64)
build: stop clean
	docker buildx build --platform linux/amd64  --load --no-cache -t marketing .

# Build the Docker image with cache (for deployment - linux/amd64)
build-cache: stop
	docker buildx build --platform linux/amd64 --load -t marketing .

# Build for local ARM Mac development (M1/M2)
build-local: stop
	docker buildx build --load --no-cache -t marketing .

# Run the container, ensuring the correct port and env file
run: stop
	docker run --rm --name marketing --env-file .env \
		--shm-size=1gb \
		-v $(PWD)/.wwebjs_auth:/code/.wwebjs_auth \
		-p 4000:4000 marketing

# Run the container interactively for debugging
run-it: stop
	docker run --rm -it --shm-size=1gb marketing sh
prune : stop 
	docker system prune -a

push:
	docker tag marketing mackawara/marketing:latest
	docker push mackawara/marketing:latest

status:
	git status
