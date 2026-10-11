import { ArrowUpRight, MapPin, X } from "lucide-react";
import type { Source } from "../core";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

type Props = { mode: "sources" | "install"; sources: Source[]; onClose: () => void };
export function InformationModal({ mode, sources, onClose }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="modal" aria-modal="true" showCloseButton={false}>
        <DialogDescription className="sr-only">
          {mode === "sources" ? "資料來源、授權與使用限制" : "依照裝置加入主畫面的方式"}
        </DialogDescription>
        <Button
          variant="ghost"
          type="button"
          className="modal-close icon-button"
          aria-label="關閉說明"
          onClick={() => onClose()}
        >
          <X size={22} />
        </Button>
        <span className="brand-symbol">
          <MapPin size={23} />
        </span>
        <DialogTitle asChild>
          <h2 id="modal-title">
            {mode === "sources" ? "每一點，都有出處。" : "把方便，帶在身邊。"}
          </h2>
        </DialogTitle>
        {mode === "sources" ? (
          <>
            <p>
              收錄日本與韓國全國範圍的 OpenStreetMap
              點位，並補入地方官方資料。城市選單可快速前往，拖曳地圖會載入新範圍；各城市仍可能缺漏，收錄筆數不代表已包含所有公廁。同一設施的不同來源紀錄可能重複。
            </p>
            <p>
              <a className="license-link" href="/api/v1/osm-export?country=JP">
                日本 OSM 原始與整理資料 ↗
              </a>
              {" · "}
              <a className="license-link" href="/api/v1/osm-export?country=KR">
                韓國 OSM 原始與整理資料 ↗
              </a>
            </p>
            {sources.map((s) => (
              <div className="source-row" key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <strong>{s.name}</strong>
                  <ArrowUpRight size={15} />
                </a>
                <span>
                  {s.count.toLocaleString()} 筆 · {s.license}
                  <br />
                  擷取：{s.fetchedAt.slice(0, 10)}
                </span>
                <p>{s.note}</p>
                <a
                  className="license-link"
                  href={s.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  授權說明 ↗
                </a>
              </div>
            ))}
            <div className="notice-block">
              <strong>怎麼解讀「時段開放」？</strong>
              <p>
                依當地時間與資料中的開放時段計算，不代表現場有人確認。缺少時段、複雜假日或營業時間會標示「時間未知」。私有或限顧客的設施不列入推薦。
              </p>
              <strong>定位與離線</strong>
              <p>
                定位用於裝置上的距離與地圖；載入資料時，伺服器會收到地圖範圍，未保存移動軌跡。最近下載的範圍可離線查看；底圖及外部導航需要網路或地圖
                App 自行支援。
              </p>
            </div>
          </>
        ) : (
          <>
            <p>加入主畫面，旅行途中一點就能打開。瀏覽過的廁所清單也能離線查看。</p>
            <div className="install-step">
              <span>01</span>
              <div>
                <strong>iPhone / iPad</strong>
                <p>在 Safari 開啟，點「分享」，選擇「加入主畫面」。</p>
              </div>
            </div>
            <div className="install-step">
              <span>02</span>
              <div>
                <strong>Android</strong>
                <p>在 Chrome 選單選擇「安裝應用程式」或「加入主畫面」。</p>
              </div>
            </div>
            <div className="install-step">
              <span>03</span>
              <div>
                <strong>桌面瀏覽器</strong>
                <p>若支援安裝，點網址列中的安裝圖示。也可直接加入書籤。</p>
              </div>
            </div>
            <p className="install-note">安裝選項依瀏覽器而異；私人託管網址可能需先登入。</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
