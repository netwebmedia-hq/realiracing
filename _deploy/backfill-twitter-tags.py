#!/usr/bin/env python3
"""Add Twitter/X card tags to every page that has Open Graph tags but no twitter:card.

The tags mirror the page's own og:title / og:description / og:image, so nothing new is
invented. New posts get them from the generator template; this brings older committed
output into line. Idempotent: pages that already have twitter:card are left alone.

  python3 _deploy/backfill-twitter-tags.py [--check]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = ("_deploy", "_ci", "hyperframes-highlights", "slides", "node_modules", ".git", "galleries/img", "_stage")
OG = re.compile(r'^([ \t]*)<meta property="og:([a-z:_]+)" content="([^"]*)"\s*/?>[ \t]*(\r?\n)', re.M)


def tag(name, value, slash):
    return '<meta name="twitter:%s" content="%s"%s>' % (name, value, ' /' if slash else '')


def process(path):
    with open(path, encoding='utf8', newline='') as fh:
        s = fh.read()
    if 'name="twitter:card"' in s or 'property="og:title"' not in s:
        return False
    ogs = {}
    last = None
    for m in OG.finditer(s):
        ogs.setdefault(m.group(2), m.group(3))
        last = m
    if not last or 'title' not in ogs:
        return False
    slash = bool(re.search(r'<meta property="og:title" content="[^"]*"\s*/>', s))
    ind, eol = last.group(1), last.group(4)
    out = [tag('card', 'summary_large_image' if 'image' in ogs else 'summary', slash),
           tag('title', ogs['title'], slash)]
    if 'description' in ogs:
        out.append(tag('description', ogs['description'], slash))
    if 'image' in ogs and 'name="twitter:image"' not in s:
        out.append(tag('image', ogs['image'], slash))
    add = ''.join(ind + t + eol for t in out)
    new = s[:last.end()] + add + s[last.end():]
    if '--check' not in sys.argv:
        with open(path, 'w', encoding='utf8', newline='') as fh:
            fh.write(new)
    return True


n = 0
for p in sorted(ROOT.rglob('*.html')):
    rel = p.relative_to(ROOT).as_posix()
    if any(rel == k or rel.startswith(k + '/') for k in SKIP):
        continue
    if process(p):
        n += 1
        if '--check' in sys.argv:
            print('missing twitter tags:', rel)
print('%d page(s) %s' % (n, 'need tags' if '--check' in sys.argv else 'updated'))
sys.exit(1 if ('--check' in sys.argv and n) else 0)
