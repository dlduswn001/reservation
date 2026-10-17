"use client";

import { useEffect, useMemo, useState } from "react";

type DiaryStudent = { id: string; name: string; phone_last4: string; is_active: boolean };
type Diary = {
  id: string;
  student_id: string;
  lesson_at: string;
  title: string;
  lesson_notes: string;
  feedback: string;
  homework: string;
  message_text: string;
  delivery_status: "draft" | "sent";
  created_at: string;
  sent_at?: string | null;
};
type Draft = {
  title: string;
  lesson_at: string;
  lesson_notes: string;
  feedback: string;
  homework: string;
  message_text: string;
};

function seoulLocalNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return [get("year"), get("month"), get("day")].join("-") + "T" + get("hour") + ":" + get("minute");
}
function kstLocal(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return [get("year"), get("month"), get("day")].join("-") + "T" + get("hour") + ":" + get("minute");
}
function koreanDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long",
    day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
const blankDraft = (): Draft => ({
  lesson_at: seoulLocalNow(), title: "", lesson_notes: "", feedback: "",
  homework: "", message_text: "",
});
const miniButton = { padding: "9px 13px", fontSize: 13, marginTop: 0, borderRadius: 9 };
const fieldLabel = { marginTop: 14, fontSize: 13 };
const field = { borderRadius: 9, padding: "11px 12px", background: "#fff", borderColor: "#e1e1e1" };
const muted = { fontSize: 13, color: "#717171", lineHeight: 1.65 };
const card = { background: "#fff", padding: 18, border: "1px solid #e5e5e5", borderRadius: 14, marginBottom: 12 };
const row = { display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" };

export default function DiaryBoard({
  students, password, initialStudentId,
}: { students: DiaryStudent[]; password: string; initialStudentId?: string }) {
  const orderedStudents = useMemo(() =>
    [...students].sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false)
      || a.name.localeCompare(b.name, "ko")), [students]);
  const [selectedStudentId, setSelectedStudentId] = useState(
    initialStudentId || orderedStudents[0]?.id || "",
  );
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const student = orderedStudents.find((person) => person.id === selectedStudentId);

  async function callApi(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/diaries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ password, student_id: selectedStudentId, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "수강일지를 처리하지 못했습니다.");
    return json;
  }

  async function load(studentId: string) {
    if (!studentId) { setDiaries([]); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/diaries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "list", password, student_id: studentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "수강일지를 불러오지 못했습니다.");
      setDiaries(json.diaries || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "수강일지를 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(selectedStudentId); }, [selectedStudentId, password]);
  useEffect(() => {
    if (initialStudentId && orderedStudents.some((s) => s.id === initialStudentId)) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, orderedStudents]);

  function resetEditor() {
    setEditingId(""); setDraft(blankDraft());
  }

  function beginEdit(item: Diary) {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      lesson_at: kstLocal(item.lesson_at),
      lesson_notes: item.lesson_notes || "",
      feedback: item.feedback || "",
      homework: item.homework || "",
      message_text: item.message_text || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveDiary() {
    if (!selectedStudentId || !draft.title.trim() || !draft.lesson_at) {
      setStatus("수강생과 수업 날짜, 수업명을 확인해 주세요."); return;
    }
    setLoading(true); setStatus("");
    try {
      await callApi({ action: "save", ...(editingId ? { id: editingId } : {}), ...draft });
      setStatus(editingId ? "수강일지를 수정했습니다." : "수강일지를 저장했습니다.");
      resetEditor();
      await load(selectedStudentId);
    } catch (error) { setStatus(error instanceof Error ? error.message : "수강일지를 저장하지 못했습니다."); }
    finally { setLoading(false); }
  }

  async function deleteDiary(item: Diary) {
    if (!window.confirm(item.title + " 수강일지를 삭제할까요? 삭제 후 복구할 수 없습니다.")) return;
    setLoading(true); setStatus("");
    try {
      await callApi({ action: "delete", id: item.id });
      if (editingId === item.id) resetEditor();
      setStatus("수강일지를 삭제했습니다.");
      await load(selectedStudentId);
    } catch (error) { setStatus(error instanceof Error ? error.message : "삭제하지 못했습니다."); }
    finally { setLoading(false); }
  }

  function makeStudentMessage() {
    const date = draft.lesson_at?.slice(0, 10)?.replace(/-/g, ". ") || "";
    const paragraphs = [
      "안녕하세요. 문장학교입니다.",
      date + " " + (draft.title || "수업") + " 안내드립니다.",
      draft.lesson_notes.trim() ? "오늘의 수업\n" + draft.lesson_notes.trim() : "",
      draft.homework.trim() ? "다음 시간까지의 과제\n" + draft.homework.trim() : "",
      "감사합니다. 문장학교 드림",
    ].filter(Boolean);
    setDraft((current) => ({ ...current, message_text: paragraphs.join("\n\n") }));
    setStatus("전달용 문구를 만들었습니다. 내용을 검토한 뒤 복사해 주세요.");
  }

  async function copyText(value: string) {
    if (!value.trim()) { setStatus("전달할 메시지를 먼저 작성해 주세요."); return; }
    try {
      await navigator.clipboard.writeText(value);
      setStatus("문구를 복사했습니다. 카카오톡 채널 관리자에서 대상 수강생을 확인한 뒤 직접 보내주세요.");
    } catch {
      setStatus("자동 복사에 실패했습니다. 전달용 메시지 입력창에서 문구를 직접 복사해 주세요.");
    }
  }

  return (
    <div>
      <section style={card}>
        <h2 style={{ fontSize: 20, marginBottom: 7 }}>수강일지</h2>
        <p style={muted}>선생님 전용 기록입니다. 수강생 예약 화면에는 공개되지 않습니다.</p>
        <label style={fieldLabel}>수강생 선택</label>
        <select style={field} value={selectedStudentId} onChange={(e) => {
          setSelectedStudentId(e.target.value); resetEditor(); setStatus("");
        }}>
          <option value="">수강생 선택</option>
          <optgroup label="재원생">
            {orderedStudents.filter((s) => s.is_active !== false).map((s) =>
              <option key={s.id} value={s.id}>{s.name} · {s.phone_last4}</option>)}
          </optgroup>
          <optgroup label="퇴원생">
            {orderedStudents.filter((s) => s.is_active === false).map((s) =>
              <option key={s.id} value={s.id}>{s.name} · {s.phone_last4}</option>)}
          </optgroup>
        </select>
        {student && <p style={muted}>{student.name}님의 수강일지 {diaries.length}건</p>}
      </section>

      {selectedStudentId && (
        <section style={card}>
          <h3 style={{ fontSize: 17, marginTop: 0 }}>{editingId ? "수강일지 수정" : "새 수강일지 작성"}</h3>
          <label style={fieldLabel}>수업 일시</label>
          <input style={field} type="datetime-local" value={draft.lesson_at} onChange={(e) =>
            setDraft((v) => ({ ...v, lesson_at: e.target.value }))} />
          <label style={fieldLabel}>수업명</label>
          <input style={field} value={draft.title} placeholder="예: 나만의 에세이 3회차" onChange={(e) =>
            setDraft((v) => ({ ...v, title: e.target.value }))} />
          <label style={fieldLabel}>오늘의 수업 내용</label>
          <textarea style={field} rows={4} value={draft.lesson_notes} placeholder="읽은 글, 작성한 원고, 수업에서 다룬 핵심 내용" onChange={(e) =>
            setDraft((v) => ({ ...v, lesson_notes: e.target.value }))} />
          <label style={fieldLabel}>선생님 피드백 · 내부 메모</label>
          <textarea style={field} rows={4} value={draft.feedback} placeholder="학생의 강점, 보완점, 다음 수업 방향 (외부에 자동 공유되지 않습니다)" onChange={(e) =>
            setDraft((v) => ({ ...v, feedback: e.target.value }))} />
          <label style={fieldLabel}>다음 과제</label>
          <textarea style={field} rows={2} value={draft.homework} placeholder="다음 수업 전까지 준비할 내용" onChange={(e) =>
            setDraft((v) => ({ ...v, homework: e.target.value }))} />
          <div style={{ ...card, background: "#fafafa", padding: 14, marginTop: 18, marginBottom: 14 }}>
            <strong style={{ fontSize: 14 }}>수강생에게 보낼 카카오톡 문구</strong>
            <p style={muted}>아래 문구만 발송 대상으로 사용합니다. 내부 피드백은 자동 포함하지 않습니다.</p>
            <button style={miniButton} type="button" className="secondary" onClick={makeStudentMessage}>수업 내용으로 문구 만들기</button>
            <textarea style={{ ...field, marginTop: 12, background: "#fff" }} rows={7}
              value={draft.message_text} placeholder="수강생에게 전달할 문구를 작성해 주세요."
              onChange={(e) => setDraft((v) => ({ ...v, message_text: e.target.value }))} />
            <div style={{ ...row, marginTop: 9 }}>
              <button style={miniButton} type="button" className="secondary" onClick={() => copyText(draft.message_text)}>발송 문구 복사</button>
              <a style={{ ...miniButton, display: "inline-flex", alignItems: "center", border: "1px solid #dedede", borderRadius: 9 }}
                target="_blank" rel="noopener noreferrer" href="https://center-pf.kakao.com/">카카오톡 채널 관리자 열기 ↗</a>
            </div>
            <p style={{ ...muted, marginBottom: 0 }}>자동 발송은 비즈메시지 제공사 연결 전까지 비활성화됩니다. ‘문구 복사’는 실제 발송이 아닙니다.</p>
          </div>
          <div style={row}>
            <button style={miniButton} type="button" onClick={saveDiary} disabled={loading}>{loading ? "처리 중..." : editingId ? "수정 저장" : "수강일지 저장"}</button>
            {editingId && <button style={miniButton} type="button" className="secondary" onClick={resetEditor}>수정 취소</button>}
          </div>
          {status && <p role="status" style={{ ...muted, color: "#484848" }}>{status}</p>}
        </section>
      )}

      {selectedStudentId && (
        <section style={card}>
          <h3 style={{ fontSize: 17, marginTop: 0 }}>작성한 수강일지</h3>
          {loading && <p style={muted}>기록을 불러오는 중입니다.</p>}
          {!loading && diaries.length === 0 && <p style={muted}>아직 수강일지가 없습니다.</p>}
          {diaries.map((item) => (
            <article key={item.id} style={{ borderTop: "1px solid #eeeeee", padding: "17px 0" }}>
              <strong>{item.title}</strong>
              <p style={{ ...muted, margin: "4px 0 10px" }}>{koreanDate(item.lesson_at)} · 관리자 기록</p>
              {item.lesson_notes && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}><b>수업 내용</b>\n{item.lesson_notes}</p>}
              {item.feedback && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}><b>내부 피드백</b>\n{item.feedback}</p>}
              {item.homework && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}><b>다음 과제</b>\n{item.homework}</p>}
              {item.message_text && <p style={{ ...muted, whiteSpace: "pre-wrap" }}><b>전달용 문구</b>\n{item.message_text}</p>}
              <div style={row}>
                <button style={miniButton} type="button" className="secondary" onClick={() => beginEdit(item)}>수정</button>
                {item.message_text && <button style={miniButton} type="button" className="secondary" onClick={() => copyText(item.message_text)}>문구 복사</button>}
                <button style={miniButton} type="button" className="secondary" onClick={() => deleteDiary(item)}>삭제</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
