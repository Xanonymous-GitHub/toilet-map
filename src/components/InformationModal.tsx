import { ArrowUpRight, MapPin, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Source } from "../core";

type Props = { mode: "sources" | "install"; sources: Source[]; onClose: () => void };
export function InformationModal({ mode, sources, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <button
        type="button"
        className="modal-close icon-button"
        aria-label="關閉說明"
        onClick={() => onClose()}
      >
        <X size={22} />
      </button>
      <span className="brand-symbol">
        <MapPin size={23} />
      </span>
      <h2 id="modal-title">{mode === "sources" ? "每一點，都有出處。" : "把方便，帶在身邊。"}</h2>
      {mode === "sources" ? (
        <>
          <p>這是一張日本、韓國的公廁地圖。首爾使用官方完整資料；東京目前涵蓋江東區與新宿周邊。</p>
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
              精確位置只在裝置上使用，未保存移動軌跡。瀏覽過的城市資料可離線查看；底圖及外部導航需要網路或地圖
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
    </dialog>
  );
}
