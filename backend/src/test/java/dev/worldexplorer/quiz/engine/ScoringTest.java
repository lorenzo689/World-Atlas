package dev.worldexplorer.quiz.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class ScoringTest {

    @Test
    void instantCorrectAnswerGetsFullSpeedBonus() {
        Scoring.Result r = Scoring.score(QuestionType.CAPITAL, true, null, Duration.ZERO);
        assertThat(r.correct()).isTrue();
        assertThat(r.points()).isEqualTo(Scoring.BASE + Scoring.MAX_SPEED_BONUS);
        assertThat(r.distanceKm()).isNull();
    }

    @Test
    void speedBonusFallsLinearlyToZeroAtTheLimit() {
        Duration half = QuestionType.CAPITAL.timeLimit().dividedBy(2);
        assertThat(Scoring.score(QuestionType.CAPITAL, true, null, half).points()).isEqualTo(1250);
        assertThat(Scoring.score(QuestionType.CAPITAL, true, null, QuestionType.CAPITAL.timeLimit()).points())
                .isEqualTo(Scoring.BASE);
    }

    @Test
    void lateAnswersScoreNothingEvenIfCorrect() {
        Duration late = QuestionType.FLAG.timeLimit().plusMillis(1);
        Scoring.Result r = Scoring.score(QuestionType.FLAG, true, null, late);
        assertThat(r.points()).isZero();
        assertThat(r.late()).isTrue();
        assertThat(r.correct()).isFalse();
    }

    @Test
    void locateNearMissEarnsPartialPoints() {
        assertThat(Scoring.score(QuestionType.LOCATE, false, 0.0, Duration.ZERO).points()).isEqualTo(Scoring.MAX_NEAR_MISS);
        assertThat(Scoring.score(QuestionType.LOCATE, false, 1250.0, Duration.ZERO).points()).isEqualTo(250);
        assertThat(Scoring.score(QuestionType.LOCATE, false, 5000.0, Duration.ZERO).points()).isZero();
    }

    @Test
    void wrongMultipleChoiceAnswerScoresZero() {
        assertThat(Scoring.score(QuestionType.CAPITAL, false, null, Duration.ofSeconds(1)).points()).isZero();
    }
}
