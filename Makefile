.PHONY: extract dev build clean

extract:
	python extract.py extract

dev: extract
	cd www && pnpm dev

build: extract
	cd www && pnpm build

clean:
	cd www && pnpm clean
