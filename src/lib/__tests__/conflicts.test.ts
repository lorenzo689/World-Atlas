import { describe, expect, it } from 'vitest'
import { CONFLICT_BRIEFS, sourceAgeDays, validateConflictBriefs } from '../conflicts'
import { HISTORY_EVENTS } from '../historyCompare'
import { HISTORY_STORIES } from '../historyStories'

describe('curated learning content', () => {
  it('keeps every conflict brief sourced, dated and geographically valid', () => {
    expect(CONFLICT_BRIEFS.length).toBeGreaterThanOrEqual(4)
    expect(validateConflictBriefs(CONFLICT_BRIEFS, new Date('2026-10-18T12:00:00Z'))).toEqual([])
    expect(CONFLICT_BRIEFS.find((brief) => brief.id === 'gaza')?.status).toBe('fragile-ceasefire')
    expect(sourceAgeDays('2026-10-16', new Date('2026-10-18T12:00:00Z'))).toBe(2)
  })

  it('links every guided lesson to an event and a primary source', () => {
    expect(HISTORY_STORIES.map((story) => story.id).sort()).toEqual(HISTORY_EVENTS.map((event) => event.id).sort())
    for (const story of HISTORY_STORIES) {
      expect(story.steps.length).toBeGreaterThanOrEqual(3)
      expect(HISTORY_EVENTS.find((event) => event.id === story.id)?.source).toMatch(/^https:\/\//)
    }
  })
})
