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

"use client";

import { type FunctionComponent, type HTMLProps, useCallback, useEffect, useRef, useState } from "react";
import {
  ONRAMP_EVENT_TYPES,
  createOnrampKit,
  parseOnrampSession,
  type OnrampEventEnvelope,
} from "@circle-fin/onramp-kit";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { WIDGET_BASE_URL } from "@/lib/onramp-environment";
import { requestWalletRefresh } from "@/lib/wallet-refresh";

type OnrampSession = ReturnType<typeof parseOnrampSession>;

const SESSION_URL = "/api/onramp/session";

/**
 * Mints a session for the signed-in user. The destination address is resolved
 * server-side from their wallet, so there is nothing to send.
 */
async function createSession(): Promise<OnrampSession> {
  const response = await fetch(SESSION_URL, { method: "POST" });
  const parsedResponse = await response.json();

  if (!response.ok) {
    throw new Error(parsedResponse.error ?? "Could not create an onramp session");
  }

  return parseOnrampSession(parsedResponse);
}

/**
 * Opens Circle's hosted onramp in a popup so the user can buy USDC straight
 * into their escrow wallet.
 *
 * Popup mode only, which sets two constraints this component is built around:
 * `openWindow` has to run synchronously inside the click handler or the browser
 * blocks the window, and a session is single-use. So one is always minted ahead
 * of the click, and a fresh one is minted as soon as the last is spent.
 */
export const AddMoneyButton: FunctionComponent<HTMLProps<HTMLElement>> = ({ className }) => {
  const [session, setSession] = useState<OnrampSession | null>(null);

  // Lazily constructed so nothing touches `window` during SSR. The getter is
  // synchronous, which openWindow requires.
  const kitRef = useRef<ReturnType<typeof createOnrampKit> | null>(null);
  const getKit = () => (kitRef.current ??= createOnrampKit({ widgetBaseUrl: WIDGET_BASE_URL }));

  // Held so the popup is torn down if the dashboard unmounts with it open —
  // the controller keeps a window `message` listener and an init timer alive.
  const widgetRef = useRef<{ close: () => void } | null>(null);

  const mintSession = useCallback(async () => {
    setSession(null);
    try {
      setSession(await createSession());
    } catch (error) {
      console.error("Failed to create an onramp session", error);
      toast.error("Could not prepare the deposit", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, []);

  useEffect(() => {
    void mintSession();
    return () => widgetRef.current?.close();
  }, [mintSession]);

  // The widget reports the deposit; Circle credits the wallet. Where the Circle
  // webhook is reachable it writes the new balance and the transaction row on
  // its own, and Realtime carries both. This covers the case where it is not —
  // a local run without ngrok — by asking the wallet to re-read itself.
  const handleEvent = useCallback((envelope: OnrampEventEnvelope) => {
    if (envelope.event === ONRAMP_EVENT_TYPES.DEPOSIT_SUBMITTED) {
      // Some deposits credit on submission and never emit a settle event of
      // their own; the widget flags those with `settlementExpected: false`.
      // Treating only DEPOSIT_SETTLED as done would miss them entirely.
      if (envelope.payload.settlementExpected === false) {
        toast.success("Deposit complete");
        requestWalletRefresh();
        return;
      }

      toast.info("Deposit submitted", { description: "It will land once it settles." });
      return;
    }

    if (envelope.event !== ONRAMP_EVENT_TYPES.DEPOSIT_SETTLED) return;

    toast.success("Deposit settled");
    requestWalletRefresh();
  }, []);

  // Must stay synchronous up to openWindow — an `await` here hands the browser
  // a call frame with no user gesture in it, and the popup gets blocked.
  const addMoney = () => {
    if (!session) return;

    const result = getKit().openWindow({
      session,
      // Fires when the session idles out mid-flow, and when the widget rejects
      // the token outright. Either way the cure is a new session.
      onSessionExpired: () => {
        void mintSession();
      },
    });

    if (result.status === "blocked") {
      toast.error(
        result.reason === "popup_blocked"
          ? "Your browser blocked the popup. Allow popups for this site and try again."
          : `Deposit window unavailable (${result.reason})`,
        { description: result.errorMessage },
      );
    } else {
      widgetRef.current = result.widget;
      result.widget.on("*", handleEvent);
    }

    // Spent either way, so line up the next one.
    void mintSession();
  };

  return (
    <Button className={className} disabled={!session} onClick={addMoney}>
      {session ? (
        <>
          <Plus className="mr-2 h-4 w-4" />
          Add money
        </>
      ) : (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Preparing...
        </>
      )}
    </Button>
  );
};
