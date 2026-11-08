// 일정 공통 모양 (DB를 모르는 순수 값). 브라우저에서도 씁니다.
// 2026-11-08부터 할 일은 시각 없이 날짜·순서만 가지므로, 빈 시간을 찾아 넣는 자동 배치 규칙은 없습니다.

// 시작·끝 시각(ms) 구간
export type Interval = { start: number; end: number }

// 일하는 시간: 요일(0=일 … 6=토)과 하루 시작·끝(0시부터 지난 분)
export type WorkHours = { days: number[]; start: number; end: number }

// 앞으로 이 기간 안의 할 일만 한꺼번에 옮깁니다(일정 미루기).
export const HORIZON_DAYS = 120

export const DEFAULT_WORK_HOURS: WorkHours = { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 18 * 60 }
