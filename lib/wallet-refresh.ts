/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side "this wallet just changed" signal.
 *
 * Circle's webhook is the real source of truth: it writes the new balance and
 * the transaction row, and Supabase Realtime carries both to every open tab. But
 * the webhook needs a public URL, so on a local machine without ngrok running it
 * never arrives — and the onramp popup is then the only thing that knows a
 * deposit happened.
 *
 * This is that fallback path. The popup dispatches on `window`; the balance and
 * the transactions table listen. Where the webhook does reach the app, both
 * paths land on the same figure, so a duplicate refresh is harmless.
 *
 * A window event rather than a callback because the balance renders in two
 * places (the dashboard card and the wallet dialog) and the transactions table
 * in a third, none of which share a parent with the button.
 */
export const WALLET_REFRESH_EVENT = "wallet:refresh";

export function requestWalletRefresh() {
  window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
}
