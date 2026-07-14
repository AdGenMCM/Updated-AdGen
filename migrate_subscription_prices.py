from __future__ import annotations

import argparse
import os
import sys
from typing import Iterator

import stripe
from dotenv import load_dotenv


def iter_subscriptions_for_price(old_price_id: str) -> Iterator[stripe.Subscription]:
    """
    Return active/trialing/past_due subscriptions containing old_price_id.
    Handles Stripe pagination automatically.
    """
    subscriptions = stripe.Subscription.list(
        status="all",
        limit=100,
        expand=["data.items.data.price"],
    )

    for subscription in subscriptions.auto_paging_iter():
        if subscription.status not in {"active", "trialing", "past_due"}:
            continue

        for item in subscription["items"]["data"]:
            price = item.get("price") or {}
            if price.get("id") == old_price_id:
                yield subscription
                break


def migrate_subscription(
    subscription: stripe.Subscription,
    old_price_id: str,
    new_price_id: str,
    *,
    dry_run: bool,
) -> bool:
    matching_item = None

    for item in subscription["items"]["data"]:
        price = item.get("price") or {}
        if price.get("id") == old_price_id:
            matching_item = item
            break

    if not matching_item:
        return False

    if subscription.get("schedule"):
        print(
            f"SKIPPED {subscription.id}: controlled by subscription schedule "
            f"{subscription['schedule']}"
        )
        return False

    quantity = matching_item.get("quantity") or 1

    print(
        f"{'WOULD MIGRATE' if dry_run else 'MIGRATING'} "
        f"{subscription.id}: {old_price_id} -> {new_price_id}"
    )

    if dry_run:
        return True

    stripe.Subscription.modify(
        subscription.id,
        items=[
            {
                "id": matching_item["id"],
                "price": new_price_id,
                "quantity": quantity,
            }
        ],
        proration_behavior="none",
        metadata={
            **dict(subscription.get("metadata") or {}),
            "price_migrated_from": old_price_id,
            "price_migrated_to": new_price_id,
        },
    )

    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Move Stripe subscriptions to a new price at next renewal."
    )
    parser.add_argument("--old-price", required=True)
    parser.add_argument("--new-price", required=True)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes. Without this flag, the script performs a dry run.",
    )
    args = parser.parse_args()

    load_dotenv(override=True)

    secret_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    if not secret_key:
        print("STRIPE_SECRET_KEY is missing.", file=sys.stderr)
        return 1

    stripe.api_key = secret_key

    old_price = stripe.Price.retrieve(args.old_price)
    new_price = stripe.Price.retrieve(args.new_price)

    if old_price.get("recurring") is None or new_price.get("recurring") is None:
        print("Both prices must be recurring subscription prices.", file=sys.stderr)
        return 1

    old_interval = old_price["recurring"].get("interval")
    new_interval = new_price["recurring"].get("interval")

    if old_interval != new_interval:
        print(
            "The billing intervals do not match. This script only handles "
            "same-interval migrations.",
            file=sys.stderr,
        )
        return 1

    dry_run = not args.apply
    matched = 0

    for subscription in iter_subscriptions_for_price(args.old_price):
        if migrate_subscription(
            subscription,
            args.old_price,
            args.new_price,
            dry_run=dry_run,
        ):
            matched += 1

    print(
        f"\n{'Dry run complete' if dry_run else 'Migration complete'}: "
        f"{matched} subscription(s) matched."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())