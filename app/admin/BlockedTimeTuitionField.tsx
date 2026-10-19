"use client";

import { useId, useState } from "react";
import type { BlockedTimeTuition } from "../../lib/blockedTimeRevenue";
import { validTuitionAmount } from "../../lib/bookingTuition";

type Props = {
  blockId: string;
  password: string;
  tuition?: BlockedTimeTuition | null;
  onSaved?: (entry: BlockedTimeTuition) => void;
};

export default function BlockedTimeTuitionField({ blockId, password, tuition, onSaved }: Props) {
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [memo, setMemo] = useState("");
  const [snapshot, setSnapshot] = useState<BlockedTimeTuition | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = tuition || snapshot;

  function open() {
    if (!editing) {
      setAmount(current?.amount_krw === null || current?.amount_krw === undefined ? "" : String(current.amount_krw));
      setConfirmed(Boolean(current?.confirmed_at));
      setMemo(current?.memo || "");
      setMessage("");
    }
    setEditing(value => !value);
  }

  async function save() {
    if (amount.trim() && !/^\d+$/.test(amount.trim())) {
      setMessage("수강료는 0원 이상의 정수로 입력해 주세요.");
      return;
    }
    const parsed = amount.trim() ? Number(amount.trim()) : null;
    if (!validTuitionAmount(parsed) || (confirmed && parsed === null)) {
      setMessage("금액을 확인해 주세요. 입금 확인 시에는 수강료가 필요합니다.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/blocked-time-tuition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          password,
          action: "save",
          block_id: blockId,
          amount_krw: parsed,
          confirmed,
          memo,
          updated_at: current?.updated_at || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "저장할 수 없습니다.");
      setSnapshot(data.tuition);
      onSaved?.(data.tuition);
      setEditing(false);
      setMessage("수강료 저장 완료");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수강료 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #e9dce0" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <strong style={{ fontSize: 13, color: "#70293f" }}>
        {current?.amount_krw === null || current?.amount_krw === undefined
          ? "수강료 미입력" : "직접 입력 수강료 " + current.amount_krw.toLocaleString("ko-KR") + "원"}
      </strong>
      <button type="button" className="secondary compact" style={{ margin: 0, padding: "7px 11px", fontSize: 12 }}
        aria-expanded={editing} disabled={busy} onClick={open}>{editing ? "닫기" : current?.amount_krw === null || current?.amount_krw === undefined ? "수강료 입력" : "금액 수정"}</button>
    </div>
    {current?.amount_krw !== null && current?.amount_krw !== undefined && (
      <span style={{ fontSize: 12, color: "#80777b" }}>{current.confirmed_at ? "입금 확인됨" : "입금 미확인"}</span>
    )}
    {editing && <fieldset disabled={busy} style={{ minWidth: 0, margin: "10px 0 0", padding: 0, border: 0 }}>
      <label htmlFor={uid + "-amount"} style={{ fontSize: 13 }}>이 일정의 수강료 (원)</label>
      <input id={uid + "-amount"} type="number" min={0} step={1} inputMode="numeric" max={2147483647}
        placeholder="금액을 입력하면 수업 매출에 반영됩니다" value={amount} onChange={e => setAmount(e.target.value)} />
      <label htmlFor={uid + "-confirmed"} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13 }}>
        <input id={uid + "-confirmed"} type="checkbox" style={{ width: "auto" }} checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)} />입금 확인 완료
      </label>
      <label htmlFor={uid + "-memo"} style={{ fontSize: 13 }}>메모 (선택)</label>
      <input id={uid + "-memo"} maxLength={1000} value={memo} onChange={e => setMemo(e.target.value)} />
      <button type="button" onClick={() => void save()}>{busy ? "저장 중…" : "수강료 저장"}</button>
      <p className="small">체험수업·외부 차단 일정 등은 금액을 입력한 경우에만 수업 매출에 포함됩니다. 수강권과 예약 상태는 변경되지 않습니다.</p>
    </fieldset>}
    {message && <p role="status" style={{ fontSize: 12, color: "#70293f" }}>{message}</p>}
  </div>;
}
