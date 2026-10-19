"use client";

import { useEffect, useId, useState } from "react";
import { BookingTuition, validTuitionAmount } from "../../lib/bookingTuition";

export default function BookingTuitionEditor({ bookingId, password, onSaved }: { bookingId: string; password: string; onSaved?: (tuition: BookingTuition) => void }) {
  const id = useId();
  const [saved, setSaved] = useState<BookingTuition | null>(null);
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  function populate(tuition: BookingTuition) {
    setSaved(tuition);
    setAmount(tuition.amount_krw === null ? "" : String(tuition.amount_krw));
    setConfirmed(Boolean(tuition.confirmed_at));
    setMemo(tuition.memo || "");
  }

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setMessage("");
    setSaved(null);
    (async () => {
      try {
        const response = await fetch("/api/admin/booking-tuition", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, booking_id: bookingId, action: "load" }),
          signal: controller.signal, cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message);
        if (!controller.signal.aborted) populate(json.tuition);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "수강료를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, [bookingId, password, reload]);

  async function save() {
    const value = amount.trim() === "" ? null : Number(amount);
    if (!validTuitionAmount(value) || (confirmed && value === null)) {
      setMessage("입금 확인할 금액을 0원 이상의 정수로 입력해 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/booking-tuition", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, booking_id: bookingId, action: "save",
          amount_krw: value, confirmed, memo, updated_at: saved?.updated_at }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      populate(json.tuition);
      onSaved?.(json.tuition);
      setMessage("입금 기록을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다. 입력 내용은 유지됩니다.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #e7e4e5", paddingTop: 12 }}>
      <strong>수강료 · 입금 확인</strong>
      {saved && <p className="small">저장 상태: {saved.confirmed_at ? "입금 확인 완료" : "입금 미확인"}</p>}
      <fieldset disabled={busy || !saved} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label htmlFor={`${id}-amount`}>수강료 (원)</label>
        <input id={`${id}-amount`} type="number" inputMode="numeric" min="0" max="2147483647" step="1"
          value={amount} onChange={event => setAmount(event.target.value)} placeholder="금액 직접 입력" />
        <label htmlFor={`${id}-confirmed`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
          <input id={`${id}-confirmed`} type="checkbox" style={{ width: "auto" }} checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />입금 확인 완료
        </label>
        <label htmlFor={`${id}-memo`}>입금 메모</label>
        <input id={`${id}-memo`} value={memo} maxLength={1000} onChange={event => setMemo(event.target.value)} placeholder="입금자명 등 (선택)" />
        <button type="button" onClick={save}>{busy ? "처리 중…" : "입금 기록 저장"}</button>
      </fieldset>
      <p className="small">금액은 수정할 수 있습니다. 계좌이체·수강권 차감·등록 매출 합산은 하지 않습니다.</p>
      {message && <p role="status" className="small">{message}</p>}
      {message && <button type="button" disabled={busy} onClick={() => {
        if (!saved || window.confirm("저장하지 않은 입력을 버리고 다시 불러올까요?")) setReload(value => value + 1);
      }}>다시 불러오기</button>}
    </div>
  );
}
