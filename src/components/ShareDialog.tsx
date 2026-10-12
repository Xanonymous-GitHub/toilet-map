import { Copy, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export default function ShareDialog({
  url,
  onClose,
  restoreFocus,
}: {
  url: string;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="modal share-dialog"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <Button
          variant="ghost"
          className="modal-close icon-button"
          aria-label="關閉分享網址"
          onClick={onClose}
        >
          <X />
        </Button>
        <DialogTitle>分享目前畫面</DialogTitle>
        <DialogDescription>
          瀏覽器無法自動複製，請選取下方網址後複製。連結會保留地點、廁所與畫面設定。
        </DialogDescription>
        <Input
          ref={input}
          aria-label="分享網址"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant="outline"
          onClick={() => {
            input.current?.focus();
            input.current?.select();
          }}
        >
          <Copy />
          選取網址
        </Button>
      </DialogContent>
    </Dialog>
  );
}
