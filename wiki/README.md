# Wiki pages (source)

Live wiki: **https://github.com/MrLouisWright/next-tongue/wiki**

These markdown files are the source mirror of the GitHub wiki. After editing `docs/`, regenerate them here, then publish:

```bash
git clone https://github.com/MrLouisWright/next-tongue.wiki.git
cp wiki/*.md next-tongue.wiki/   # exclude this README
cd next-tongue.wiki && git add -A && git commit -m "Sync wiki" && git push
```

Page links use GitHub wiki `[[Title|Slug]]` form (no `.md`).
