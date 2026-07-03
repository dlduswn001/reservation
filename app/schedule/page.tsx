"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ScheduleType = "regular" | "oneday" | "block" | "available";

type ScheduleItem = {
  id: string;
  type: ScheduleType;
  title: string;
  subtitle: string;
  start_at: string;
  end_at: string;
  status?: string;
  memo?: string | null;
  meta?: Record<string, unknown>;
};

type ScheduleSummary = {
  regular_count: number;
  oneday_count: number;
  block_count: number;
  available_count: number;
  oneday_booking_people: number;
};

type ScheduleResponse = {
  ok: boolean;
  range: {
    start_date: string;
    end_date: string;
    start_at: string;
    end_at: string;
  };
  summary: ScheduleSummary;
  items: ScheduleItem[];
};

type Filters = Record<ScheduleType, boolean>;

const FILTER_LABELS: Record<ScheduleType, string> = {
  regular: "정규수업",
  oneday: "원데이",
  block: "외부차단",
  available: "예약가능",
};

const TYPE_CLASS: Record<ScheduleType, string> = {
  regular: "regular",
  oneday: "oneday",
  block: "block",
  available: "available",
};

const TYPE_BADGE: Record<ScheduleType, string> = {
  regular: "정규",
  oneday: "원데이",
  block: "차단",
  available: "가능",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getKstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function todayKstString() {
  const { year, month, day } = getKstDateParts();
  return dateString(year, month, day);
}

function thisMonthRange() {
  const { year, month } = getKstDateParts();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: dateString(year, month, 1),
    end: dateString(year, month, lastDay),
  };
}

function nextMonthRange() {
  const { year, month } = getKstDateParts();
  const next = new Date(Date.UTC(year, month, 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = next.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return {
    start: dateString(nextYear, nextMonth, 1),
    end: dateString(nextYear, nextMonth, lastDay),
  };
}

function thisWeekRange() {
  const { year, month, day } = getKstDateParts();
  const base = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = base.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: dateString(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    end: dateString(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate()),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function seoulDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function overlaps(a: ScheduleItem, b: ScheduleItem) {
  return new Date(a.start_at).getTime() < new Date(b.end_at).getTime()
    && new Date(a.end_at).getTime() > new Date(b.start_at).getTime();
}

function addMinutesToLocalDateTime(value: string, minutes: number) {
  if (!value) return "";
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return "";
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute || 0, 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localNowInput() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}


function isoToSeoulLocalInput(value: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export default function AdminUnifiedSchedulePage() {
  const defaultRange = useMemo(() => thisMonthRange(), []);
  const [password, setPassword] = useState("");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    regular: true,
    oneday: true,
    block: true,
    available: false,
  });

  const [blockTitle, setBlockTitle] = useState("");
  const [blockStartAt, setBlockStartAt] = useState("");
  const [blockEndAt, setBlockEndAt] = useState("");
  const [blockMemo, setBlockMemo] = useState("");

  const [moveTarget, setMoveTarget] = useState<ScheduleItem | null>(null);
  const [moveStartAt, setMoveStartAt] = useState("");
  const [moveEndAt, setMoveEndAt] = useState("");
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveConflicts, setMoveConflicts] = useState<string[]>([]);

  useEffect(() => {
    const savedPassword = window.localStorage.getItem("munjang_admin_password") || "";
    setPassword(savedPassword);
  }, []);

  useEffect(() => {
    if (blockStartAt && !blockEndAt) {
      setBlockEndAt(addMinutesToLocalDateTime(blockStartAt, 90));
    }
  }, [blockStartAt, blockEndAt]);


  useEffect(() => {
    if (moveStartAt && moveTarget) {
      const originalStart = new Date(moveTarget.start_at).getTime();
      const originalEnd = new Date(moveTarget.end_at).getTime();
      const durationMinutes = Math.max(30, Math.round((originalEnd - originalStart) / 60000));
      setMoveEndAt(addMinutesToLocalDateTime(moveStartAt, durationMinutes));
    }
  }, [moveStartAt, moveTarget]);

  async function loadSchedule(nextStartDate = startDate, nextEndDate = endDate) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, start_date: nextStartDate, end_date: nextEndDate }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "통합 스케줄을 불러오지 못했습니다.");
      window.localStorage.setItem("munjang_admin_password", password);
      setData(json);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function applyRange(range: { start: string; end: string }) {
    setStartDate(range.start);
    setEndDate(range.end);
    if (password) loadSchedule(range.start, range.end);
  }

  async function addBlockedTime() {
    setMessage("");
    if (!blockTitle.trim()) {
      setMessage("외부 차단 제목을 입력해 주세요.");
      return;
    }
    if (!blockStartAt || !blockEndAt) {
      setMessage("차단 시작 시간과 종료 시간을 입력해 주세요.");
      return;
    }

    try {
      const response = await fetch("/api/admin/blocked-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          title: blockTitle,
          start_at: blockStartAt,
          end_at: blockEndAt,
          memo: blockMemo,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "외부 차단 일정을 추가하지 못했습니다.");

      setBlockTitle("");
      setBlockStartAt("");
      setBlockEndAt("");
      setBlockMemo("");
      setMessage("외부 차단 일정을 추가했습니다.");
      await loadSchedule();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
    }
  }

  async function deleteBlockedTime(item: ScheduleItem) {
    const blockId = String(item.meta?.block_id || "");
    if (!blockId) return;
    if (!window.confirm(`'${item.title.replace("외부차단 · ", "")}' 일정을 삭제할까요?`)) return;

    try {
      const response = await fetch(`/api/admin/blocked-times/${blockId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "외부 차단 일정을 삭제하지 못했습니다.");
      setMessage("외부 차단 일정을 삭제했습니다.");
      await loadSchedule();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
    }
  }


  function openMoveModal(item: ScheduleItem) {
    setMoveTarget(item);
    setMoveStartAt(isoToSeoulLocalInput(item.start_at));
    setMoveEndAt(isoToSeoulLocalInput(item.end_at));
    setMoveConflicts([]);
    setMessage("");
  }

  function closeMoveModal() {
    setMoveTarget(null);
    setMoveStartAt("");
    setMoveEndAt("");
    setMoveConflicts([]);
    setMoveLoading(false);
  }

  async function moveRegularBooking(force = false) {
    if (!moveTarget) return;
    const bookingId = String(moveTarget.meta?.booking_id || "");
    if (!bookingId) {
      setMessage("예약 정보를 찾지 못했습니다.");
      return;
    }
    if (!moveStartAt || !moveEndAt) {
      setMessage("변경할 시작 시간과 종료 시간을 입력해 주세요.");
      return;
    }

    setMoveLoading(true);
    setMoveConflicts([]);
    setMessage("");

    try {
      const response = await fetch("/api/admin/regular-bookings/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          booking_id: bookingId,
          new_start_at: moveStartAt,
          new_end_at: moveEndAt,
          force,
        }),
      });
      const json = await response.json();

      if (response.status === 409) {
        setMoveConflicts(Array.isArray(json.conflicts) ? json.conflicts : [json.message || "겹치는 일정이 있습니다."]);
        return;
      }

      if (!response.ok) throw new Error(json.message || "수업 시간을 변경하지 못했습니다.");

      setMessage("정규수업 시간을 변경했습니다.");
      closeMoveModal();
      await loadSchedule();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
    } finally {
      setMoveLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    return (data?.items || []).filter((item) => filters[item.type]);
  }, [data?.items, filters]);

  const conflictItemIds = useMemo(() => {
    const ids = new Set<string>();
    const activeItems = filteredItems.filter((item) => item.type !== "available");
    for (let i = 0; i < activeItems.length; i += 1) {
      for (let j = i + 1; j < activeItems.length; j += 1) {
        if (seoulDateKey(activeItems[i].start_at) !== seoulDateKey(activeItems[j].start_at)) continue;
        if (overlaps(activeItems[i], activeItems[j])) {
          ids.add(activeItems[i].id);
          ids.add(activeItems[j].id);
        }
      }
    }
    return ids;
  }, [filteredItems]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of filteredItems) {
      const key = seoulDateKey(item.start_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(item);
    }
    return [...groups.entries()].map(([dateKey, items]) => ({
      dateKey,
      label: formatDate(items[0].start_at),
      items: items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    }));
  }, [filteredItems]);

  const visibleSummary = useMemo(() => {
    return {
      regular: filteredItems.filter((item) => item.type === "regular").length,
      oneday: filteredItems.filter((item) => item.type === "oneday").length,
      block: filteredItems.filter((item) => item.type === "block").length,
      available: filteredItems.filter((item) => item.type === "available").length,
    };
  }, [filteredItems]);

  return (
    <main className="container schedulePage">
      <div className="topLinks">
        <Link href="/admin" className="small">← 관리자 페이지로</Link>
        <Link href="/" className="small">처음으로</Link>
      </div>

      <section className="card heroCard">
        <div>
          <p className="eyebrow">문장학교 관리자</p>
          <h1>통합 스케줄</h1>
          <p className="muted">정규수업 예약자, 외부 차단 일정, 원데이 클래스 일정을 한 화면에서 확인합니다.</p>
        </div>
      </section>

      <section className="card controlsCard">
        <h2>조회 기간</h2>
        <label>관리자 비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="관리자 비밀번호"
        />

        <div className="quickButtons">
          <button className="secondary" onClick={() => applyRange({ start: todayKstString(), end: todayKstString() })}>오늘</button>
          <button className="secondary" onClick={() => applyRange(thisWeekRange())}>이번 주</button>
          <button className="secondary" onClick={() => applyRange(thisMonthRange())}>이번 달</button>
          <button className="secondary" onClick={() => applyRange(nextMonthRange())}>다음 달</button>
        </div>

        <div className="dateGrid">
          <div>
            <label>시작일</label>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div>
            <label>종료일</label>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </div>

        <button onClick={() => loadSchedule()} disabled={loading || !password}>
          {loading ? "불러오는 중..." : "통합 스케줄 보기"}
        </button>
        {message && <p className={message.includes("추가") || message.includes("삭제") || message.includes("변경") ? "success" : "error"}>{message}</p>}
      </section>

      {data && (
        <>
          <section className="card summaryCard">
            <div className="summaryGrid">
              <div><span>정규수업</span><strong>{data.summary.regular_count}건</strong></div>
              <div><span>원데이</span><strong>{data.summary.oneday_count}건</strong></div>
              <div><span>외부차단</span><strong>{data.summary.block_count}건</strong></div>
              <div><span>예약가능</span><strong>{data.summary.available_count}개</strong></div>
            </div>
            <p className="rangeText">{startDate} ~ {endDate} 기준입니다. 예약가능 시간은 화면이 복잡해지지 않도록 기본적으로 숨겨져 있습니다.</p>
          </section>

          <section className="card filterCard">
            <h2>표시 항목</h2>
            <div className="filterGrid">
              {(Object.keys(filters) as ScheduleType[]).map((key) => (
                <label key={key} className={`filterPill ${filters[key] ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  {FILTER_LABELS[key]}
                </label>
              ))}
            </div>
            <p className="muted smallText">
              현재 표시: 정규 {visibleSummary.regular}건 · 원데이 {visibleSummary.oneday}건 · 외부차단 {visibleSummary.block}건 · 예약가능 {visibleSummary.available}개
            </p>
          </section>

          <section className="card blockCard">
            <h2>외부 차단 일정 추가</h2>
            <p className="muted">네이버 예약, 상담, 체험수업, 개인 일정처럼 정규수업 예약을 막아야 하는 시간을 등록합니다.</p>
            <div className="formGrid">
              <div>
                <label>제목</label>
                <input value={blockTitle} onChange={(event) => setBlockTitle(event.target.value)} placeholder="예: 네이버 상담 / 외부 수업 / 개인 일정" />
              </div>
              <div>
                <label>시작</label>
                <input type="datetime-local" value={blockStartAt} onChange={(event) => setBlockStartAt(event.target.value)} placeholder={localNowInput()} />
              </div>
              <div>
                <label>종료</label>
                <input type="datetime-local" value={blockEndAt} onChange={(event) => setBlockEndAt(event.target.value)} />
              </div>
              <div>
                <label>메모</label>
                <input value={blockMemo} onChange={(event) => setBlockMemo(event.target.value)} placeholder="선택 입력" />
              </div>
            </div>
            <button onClick={addBlockedTime} disabled={!password}>외부 차단 등록</button>
          </section>

          <section className="scheduleList">
            {groupedItems.length === 0 && (
              <div className="card emptyCard">
                <h2>표시할 일정이 없습니다.</h2>
                <p>조회 기간이나 표시 항목을 조정해 주세요.</p>
              </div>
            )}

            {groupedItems.map((group) => (
              <section className="card dayCard" key={group.dateKey}>
                <h2>{group.label}</h2>
                <div className="dayItems">
                  {group.items.map((item) => {
                    const hasConflict = conflictItemIds.has(item.id);
                    return (
                      <article className={`scheduleItem ${TYPE_CLASS[item.type]} ${hasConflict ? "conflict" : ""}`} key={item.id}>
                        <div className="timeBox">
                          <strong>{formatTime(item.start_at)}</strong>
                          <span>{formatTime(item.end_at)}</span>
                        </div>
                        <div className="itemBody">
                          <div className="itemHeader">
                            <span className={`badge ${TYPE_CLASS[item.type]}`}>{TYPE_BADGE[item.type]}</span>
                            {hasConflict && <span className="warningBadge">겹침 확인</span>}
                          </div>
                          <h3>{item.title}</h3>
                          <p>{item.subtitle}</p>
                          {item.memo && item.type !== "block" && <p className="memo">{item.memo}</p>}
                          {item.type === "oneday" && item.meta?.price_label && <p className="memo">{String(item.meta.price_label)}</p>}
                          {item.type === "regular" && (
                            <button className="secondary compact" onClick={() => openMoveModal(item)}>수업 시간 변경</button>
                          )}
                          {item.type === "block" && (
                            <button className="danger compact" onClick={() => deleteBlockedTime(item)}>차단 삭제</button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        </>
      )}


      {moveTarget && (
        <div className="modalBackdrop" role="presentation">
          <section className="modalCard card" role="dialog" aria-modal="true" aria-label="정규수업 시간 변경">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">정규수업 시간 변경</p>
                <h2>{moveTarget.title.replace("정규수업 · ", "")}</h2>
              </div>
              <button className="secondary compact" onClick={closeMoveModal}>닫기</button>
            </div>
            <p className="muted smallText">
              기존 시간: {formatDate(moveTarget.start_at)} {formatTime(moveTarget.start_at)}-{formatTime(moveTarget.end_at)}
            </p>
            <div className="dateGrid">
              <div>
                <label>변경 시작</label>
                <input type="datetime-local" value={moveStartAt} onChange={(event) => setMoveStartAt(event.target.value)} />
              </div>
              <div>
                <label>변경 종료</label>
                <input type="datetime-local" value={moveEndAt} onChange={(event) => setMoveEndAt(event.target.value)} />
              </div>
            </div>
            {moveConflicts.length > 0 && (
              <div className="conflictBox">
                <strong>겹치는 일정이 있습니다.</strong>
                <ul>
                  {moveConflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}
                </ul>
                <p>그래도 변경해야 하는 예외 상황이면 아래 버튼으로 강제 변경할 수 있습니다.</p>
              </div>
            )}
            <div className="modalActions">
              <button onClick={() => moveRegularBooking(false)} disabled={moveLoading || !password}>
                {moveLoading ? "변경 중..." : "시간 변경"}
              </button>
              {moveConflicts.length > 0 && (
                <button className="danger" onClick={() => moveRegularBooking(true)} disabled={moveLoading || !password}>
                  겹쳐도 강제 변경
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .schedulePage {
          padding-bottom: 48px;
        }
        .topLinks {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .heroCard h1 {
          margin-bottom: 8px;
        }
        .eyebrow {
          margin: 0 0 6px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #8a6b45;
        }
        .muted {
          color: #6f675d;
          line-height: 1.6;
        }
        .smallText {
          font-size: 13px;
        }
        .quickButtons,
        .filterGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 12px 0;
        }
        .dateGrid,
        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin: 12px 0;
        }
        .summaryGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .summaryGrid div {
          border: 1px solid rgba(90, 70, 50, 0.12);
          border-radius: 18px;
          padding: 14px;
          background: #fffaf3;
        }
        .summaryGrid span {
          display: block;
          color: #766c61;
          font-size: 13px;
          margin-bottom: 6px;
        }
        .summaryGrid strong {
          display: block;
          font-size: 22px;
        }
        .rangeText {
          margin: 12px 0 0;
          font-size: 13px;
          color: #6f675d;
        }
        .filterPill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(90, 70, 50, 0.16);
          background: #fff;
          cursor: pointer;
          font-size: 14px;
        }
        .filterPill.active {
          background: #2f2a25;
          color: #fff;
        }
        .filterPill input {
          width: auto;
          margin: 0;
        }
        .dayCard h2 {
          margin-bottom: 14px;
        }
        .dayItems {
          display: grid;
          gap: 10px;
        }
        .scheduleItem {
          display: grid;
          grid-template-columns: 82px minmax(0, 1fr);
          gap: 12px;
          padding: 14px;
          border-radius: 20px;
          border: 1px solid rgba(90, 70, 50, 0.12);
          background: #fff;
        }
        .scheduleItem.regular {
          border-left: 6px solid #3f6eb3;
        }
        .scheduleItem.oneday {
          border-left: 6px solid #8b5fbf;
        }
        .scheduleItem.block {
          border-left: 6px solid #7a7a7a;
          background: #fafafa;
        }
        .scheduleItem.available {
          border-left: 6px solid #5b9d69;
          background: #fbfff9;
        }
        .scheduleItem.conflict {
          outline: 2px solid #d84949;
          background: #fff8f8;
        }
        .timeBox {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: flex-start;
          justify-content: flex-start;
          color: #2f2a25;
        }
        .timeBox strong {
          font-size: 18px;
        }
        .timeBox span {
          font-size: 13px;
          color: #756c62;
        }
        .itemBody h3 {
          margin: 6px 0 5px;
          font-size: 17px;
          line-height: 1.35;
        }
        .itemBody p {
          margin: 0;
          color: #625a52;
          line-height: 1.55;
        }
        .itemHeader {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .badge,
        .warningBadge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .badge.regular {
          background: #eaf1ff;
          color: #24569a;
        }
        .badge.oneday {
          background: #f2e9ff;
          color: #6f3dac;
        }
        .badge.block {
          background: #eeeeee;
          color: #555;
        }
        .badge.available {
          background: #edf8ef;
          color: #3c7b48;
        }
        .warningBadge {
          background: #ffe9e9;
          color: #ba3030;
        }
        .memo {
          margin-top: 6px !important;
          font-size: 13px;
          color: #81776d !important;
        }
        .compact {
          margin-top: 10px;
          padding: 8px 10px;
          font-size: 13px;
        }

        .modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(32, 28, 24, 0.45);
        }
        .modalCard {
          width: min(620px, 100%);
          max-height: 92vh;
          overflow: auto;
          box-shadow: 0 18px 70px rgba(0, 0, 0, 0.22);
        }
        .modalHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .modalHeader h2 {
          margin: 0;
        }
        .modalActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .conflictBox {
          border: 1px solid #f0b5b5;
          background: #fff7f7;
          color: #7d2525;
          border-radius: 16px;
          padding: 12px 14px;
          margin-top: 10px;
          line-height: 1.55;
        }
        .conflictBox ul {
          margin: 8px 0;
          padding-left: 18px;
        }
        @media (max-width: 720px) {
          .dateGrid,
          .formGrid,
          .summaryGrid {
            grid-template-columns: 1fr;
          }
          .scheduleItem {
            grid-template-columns: 70px minmax(0, 1fr);
            padding: 12px;
          }
          .timeBox strong {
            font-size: 16px;
          }
        }
      `}</style>
    </main>
  );
}
