package dev.worldexplorer.quiz;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class LearningServiceTest {
    @Test
    void missedSkillIsDueImmediatelyAndSuccessesSpaceOut() {
        Instant now = Instant.parse("2026-10-19T12:00:00Z");
        var missed = LearningService.schedule(4, 21, 2.6, false, now);
        assertThat(missed.repetitions()).isZero();
        assertThat(missed.dueAt()).isEqualTo(now);
        var first = LearningService.schedule(missed.repetitions(), missed.intervalDays(), missed.ease(), true, now);
        var second = LearningService.schedule(first.repetitions(), first.intervalDays(), first.ease(), true, now);
        var third = LearningService.schedule(second.repetitions(), second.intervalDays(), second.ease(), true, now);
        assertThat(first.intervalDays()).isEqualTo(1);
        assertThat(second.intervalDays()).isEqualTo(3);
        assertThat(third.intervalDays()).isGreaterThan(3);
    }
}
