import { Share2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";

type Props = {
  results: boolean;
  children: ReactNode;
  onClose: () => void;
  restoreFocus: () => void;
  onShare: () => void;
};

export default function MobilePanel({ results, children, onClose, restoreFocus, onShare }: Props) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className={`mobile-panel ${results ? "mobile-results-panel" : "mobile-settings-panel"}`}
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <div className="mobile-panel-heading">
          <div>
            <SheetTitle>{results ? "附近廁所" : "地點與篩選"}</SheetTitle>
            <SheetDescription>
              {results ? "依距離查看資訊，選擇廁所即可導航。" : "選擇目的地，或依照需求縮小範圍。"}
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="分享目前畫面" onClick={onShare}>
            <Share2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="返回地圖" onClick={onClose}>
            <X />
          </Button>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}
