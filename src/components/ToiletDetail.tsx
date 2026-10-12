import {
  Accessibility,
  ArrowUpRight,
  Baby,
  Clock,
  Copy,
  Heart,
  MapPin,
  Navigation,
  Share2,
  X,
} from "lucide-react";
import {
  ACCESS_LABEL,
  displayHours,
  type NavigationProvider,
  type Source,
  type Toilet,
} from "../core";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { ToiletStatus } from "./ToiletStatus";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";

type Props = {
  detail: Toilet;
  now: Date;
  saved: Set<string>;
  sources: Source[];
  onClose: () => void;
  toggleSave: (toilet: Toilet) => void;
  openNav: (provider: NavigationProvider, toilet: Toilet) => void;
  copyAddress: (toilet: Toilet) => Promise<void>;
  restoreFocus?: () => void;
  onShare: () => void;
  scrollOffset: number;
  scrollKey: string;
  onScrollOffset: (offset: number) => void;
};
export function ToiletDetail({
  detail,
  now,
  saved,
  sources,
  onClose,
  toggleSave,
  openNav,
  copyAddress,
  restoreFocus,
  onShare,
  scrollOffset,
  scrollKey,
  onScrollOffset,
}: Props) {
  const { restore, ...scroll } = useScrollRestoration(scrollOffset, scrollKey, onScrollOffset);
  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        {...scroll}
        className="detail-panel"
        aria-label="廁所詳細資訊"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          scroll.ref.current?.focus({ preventScroll: true });
          restore();
        }}
        onCloseAutoFocus={(event) => {
          if (restoreFocus) {
            event.preventDefault();
            restoreFocus();
          }
        }}
      >
        <SheetDescription className="sr-only">
          查看開放時間、設施、使用條件與步行導航。
        </SheetDescription>
        <div className="detail-top">
          <span className="eyebrow">A LITTLE RELIEF</span>
          <div>
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="分享目前畫面"
              onClick={onShare}
            >
              <Share2 size={19} />
            </Button>
            <Button
              variant="ghost"
              type="button"
              className={`icon-button ${saved.has(detail.id) ? "saved" : ""}`}
              aria-label="切換收藏"
              onClick={() => toggleSave(detail)}
            >
              <Heart size={19} fill={saved.has(detail.id) ? "currentColor" : "none"} />
            </Button>
            <Button
              variant="ghost"
              type="button"
              className="icon-button"
              aria-label="關閉廁所詳細資訊"
              onClick={() => onClose()}
            >
              <X size={21} />
            </Button>
          </div>
        </div>
        <div className="detail-icon">
          <span>WC</span>
          <MapPin size={17} />
        </div>
        <SheetTitle asChild>
          <h2>
            <span className="sr-only">廁所詳細資訊：</span>
            {detail.name}
          </h2>
        </SheetTitle>
        {detail.nameEn && <p className="detail-english">{detail.nameEn.replaceAll("_", " ")}</p>}
        <div className="detail-status">
          <ToiletStatus toilet={detail} now={now} />
          <span>{ACCESS_LABEL[detail.access]}</span>
        </div>
        <p className="detail-address">
          <MapPin size={16} />
          <span>
            {detail.address || "地址未提供"}
            {detail.entranceNote && <small>{detail.entranceNote}</small>}
          </span>
        </p>
        <div className="detail-facts">
          <div>
            <Clock size={18} />
            <span>
              開放時間<strong>{displayHours(detail.hoursRaw)}</strong>
            </span>
          </div>
          <div>
            <Accessibility size={19} />
            <span>
              無障礙廁所
              <strong>
                {detail.wheelchair === "yes"
                  ? "有提供設施"
                  : detail.wheelchair === "limited"
                    ? "部分可使用"
                    : detail.wheelchair === "no"
                      ? "未提供設施"
                      : "資訊未提供"}
              </strong>
            </span>
          </div>
          <div>
            <Baby size={18} />
            <span>
              尿布台
              <strong>
                {detail.changingTable === "yes"
                  ? "有提供"
                  : detail.changingTable === "no"
                    ? "未提供"
                    : "資訊未提供"}
              </strong>
            </span>
          </div>
          <div>
            <span className="fee-symbol">¥</span>
            <span>
              使用費用
              <strong>
                {detail.fee === "no" ? "免費" : detail.fee === "yes" ? "需付費" : "資訊未提供"}
              </strong>
            </span>
          </div>
        </div>
        <div className="detail-nav">
          <div>
            <strong>開始步行導航</strong>
            <span>選擇習慣的地圖服務</span>
          </div>
          <div className="nav-buttons">
            {(detail.country === "KR"
              ? ["kakao", "naver", "google", "apple"]
              : ["google", "apple"]
            ).map((provider) => (
              <Button
                variant="ghost"
                type="button"
                className={
                  provider === (detail.country === "KR" ? "kakao" : "google") ? "primary-nav" : ""
                }
                key={provider}
                onClick={() => openNav(provider as NavigationProvider, detail)}
              >
                <Navigation size={15} />
                {provider === "google"
                  ? "Google Maps"
                  : provider === "apple"
                    ? "Apple Maps"
                    : provider === "naver"
                      ? "NAVER App"
                      : "Kakao 網頁"}
                <ArrowUpRight size={14} />
              </Button>
            ))}
          </div>
          <p className="nav-help">
            {detail.country === "KR"
              ? "NAVER 需安裝 App；無法開啟時可使用 Kakao 網頁。"
              : "由裝置設定決定開啟地圖 App 或網頁。"}
          </p>
          <Button
            variant="ghost"
            type="button"
            className="copy-address"
            onClick={() => copyAddress(detail)}
          >
            <Copy size={14} />
            複製地址與座標
          </Button>
        </div>
        <p className="detail-disclaimer">
          時間依公開資料推估，並非現場即時確認。
          {detail.wheelchair === "yes" ? "無障礙設施資訊不代表所有入口皆無階梯。" : ""}
        </p>
        <a
          className="detail-source"
          href={sources.find((s) => s.id === detail.sourceId)?.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {sources.find((s) => s.id === detail.sourceId)?.name} · 查看原始來源
          <ArrowUpRight size={12} />
        </a>
      </SheetContent>
    </Sheet>
  );
}
