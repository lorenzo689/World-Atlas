package dev.worldexplorer.quiz;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class LeaderboardKeyTest {

    @Test
    void weeklyKeyUsesIsoWeekBasedYear() {
        // 2027-01-01 is a Friday and belongs to ISO week 53 of 2026
        assertThat(LeaderboardService.weeklyKey(LocalDate.of(2027, 1, 1))).isEqualTo("lb:weekly:2026-W53");
        assertThat(LeaderboardService.weeklyKey(LocalDate.of(2026, 10, 16))).isEqualTo("lb:weekly:2026-W42");
    }
}
