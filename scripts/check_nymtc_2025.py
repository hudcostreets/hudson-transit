#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = ["thrds"]
# ///
"""Daily check for the NYMTC 2025 Hub Bound Travel report.

If the page mentions a 2025 report, post a top-level "found!" Slack message
and exit 0 with `FOUND=true` in `$GITHUB_OUTPUT`. The workflow self-disables
on that signal.

Otherwise, maintain a single "Watching NYMTC..." thread in the channel: on
first run, bootstrap a parent message; each subsequent run edits the parent
to bump the "Polled Nx" counter and appends a threaded reply linking back
to that day's GHA run (ET timestamp). Mirrors PATH's `_post_no_new_data`
pattern. Candidate for extraction into a shared `hccs-slack-watch` helper
once HBT + PATH (and future siblings) converge on identical semantics.
"""
import os
import re
import sys
from datetime import datetime, timezone
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from thrds import SlackClient, Thread

NYMTC_URL = 'https://www.nymtc.org/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel'
BOT_NAME = 'HBT Data'
BOT_EMOJI = ':bullettrain_side:'
WATCH_MARKER = 'Watching NYMTC for 2025 HBT report'

# Detection regex for the 2025 data report on the NYMTC page. Match either
# anchor-text ("2025 Hub Bound Travel Report") or filename
# ("Hub_Bound_Travel_2025") — folder paths like "/2025 Hub Bound/" are NOT
# enough on their own, since NYMTC's 2025 folder currently houses the 2024
# *data* report.
FOUND_RE = re.compile(
    r'2025[ _-]+Hub[ _-]+Bound[ _-]+Travel[ _-]+Report|Hub_Bound_Travel_2025',
    re.IGNORECASE,
)


def fetch_page() -> str:
    with urlopen(NYMTC_URL, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')


def run_url() -> str | None:
    server = os.environ.get('GITHUB_SERVER_URL', 'https://github.com')
    repo = os.environ.get('GITHUB_REPOSITORY')
    run_id = os.environ.get('GITHUB_RUN_ID')
    return f'{server}/{repo}/actions/runs/{run_id}' if (repo and run_id) else None


def now_et_label() -> str:
    return (
        datetime.now(timezone.utc)
        .astimezone(ZoneInfo('America/New_York'))
        .strftime('%b %-d, %-I:%M %p')
    )


def reply_text() -> str:
    label = now_et_label()
    url = run_url()
    body = 'Still no 2025 HBT report on NYMTC.'
    return f'<{url}|{label}> · {body}' if url else f'{label} · {body}'


def latest_watch_op(client: SlackClient) -> dict | None:
    """Most recent top-level message from this bot whose text contains
    `WATCH_MARKER`. `conversations.history` returns newest first."""
    resp = client._request(
        'conversations.history',
        {'channel': client.channel, 'limit': 50},
        method='GET',
    )
    for msg in resp.get('messages', []):
        if msg.get('username') != BOT_NAME:
            continue
        if WATCH_MARKER in (msg.get('text') or ''):
            return msg
    return None


def gha_output(key: str, value: str) -> None:
    path = os.environ.get('GITHUB_OUTPUT')
    if not path:
        return
    with open(path, 'a') as f:
        f.write(f'{key}={value}\n')


def main(argv: list[str]) -> int:
    test_post = '--test' in argv

    token = os.environ['SLACK_BOT_TOKEN']
    channel = os.environ['SLACK_CHANNEL_ID']
    client = SlackClient(
        token=token,
        channel=channel,
        username=BOT_NAME,
        icon_emoji=BOT_EMOJI,
    )

    if test_post:
        msg = f':test_tube: HBT Data Bot smoke test ({now_et_label()} ET) — wiring works.'
        client.sync(Thread(messages=[msg]))
        print(f'Posted smoke test')
        gha_output('found', 'false')
        return 0

    html = fetch_page()
    if FOUND_RE.search(html):
        msg = (
            f':rocket: *NYMTC 2025 Hub Bound Travel report* appears to be '
            f'published! <{NYMTC_URL}|page>'
        )
        client.sync(Thread(messages=[msg]))
        print('Posted: 2025 report found')
        gha_output('found', 'true')
        return 0

    new_reply = reply_text()
    latest = latest_watch_op(client)

    if latest:
        thread_ts = latest['ts']
        existing = client.list_messages(thread_ts)
        # `existing[0]` is the OP; the rest are prior thread replies.
        existing_replies = [m.content for m in existing[1:]]
        poll_count = len(existing_replies) + 1
        op = f':hourglass_flowing_sand: {WATCH_MARKER}. Polled {poll_count}x :thread:'
        desired = [op, *existing_replies, new_reply]
        client.sync(Thread(messages=desired), thread_ts=thread_ts)
        print(f'Posted: still no data, thread_ts={thread_ts}, poll_count={poll_count}')
    else:
        op = f':hourglass_flowing_sand: {WATCH_MARKER}. Polled 1x :thread:'
        client.sync(Thread(messages=[op, new_reply]))
        print('Posted: bootstrapped new watch thread')

    gha_output('found', 'false')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
