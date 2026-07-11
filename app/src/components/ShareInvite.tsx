/** Invite link + QR code + WhatsApp share — how circles recruit worldwide. */
import QRCodeLib from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui";

export function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      void QRCodeLib.toCanvas(canvasRef.current, value, { width: size, margin: 1 });
    }
  }, [value, size]);
  return <canvas ref={canvasRef} className="rounded-xl border border-stone-200 dark:border-stone-700" />;
}

export function ShareInvite({ name, url }: { name: string; url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const message = t("create.inviteMessage", { name, url });
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied: user can still select the visible URL
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <QRCode value={url} />
      <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-stone-600 dark:text-stone-400">{t("create.inviteHint")}</p>
        <code className="block truncate rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">{url}</code>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copy()}>
            {t(copied ? "common.copied" : "create.copyLink")}
          </Button>
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            <Button variant="primary">💬 {t("create.whatsapp")}</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
