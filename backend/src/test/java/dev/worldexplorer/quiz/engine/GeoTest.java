package dev.worldexplorer.quiz.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class GeoTest {

    @Test
    void berlinToParisIsAbout880km() {
        assertThat(Geo.distanceKm(52.52, 13.405, 48.8566, 2.3522)).isCloseTo(878, within(5.0));
    }

    @Test
    void samePointIsZero() {
        assertThat(Geo.distanceKm(10, 20, 10, 20)).isZero();
    }

    @Test
    void antipodesAreHalfTheCircumference() {
        assertThat(Geo.distanceKm(0, 0, 0, 180)).isCloseTo(Math.PI * Geo.EARTH_RADIUS_KM, within(0.5));
    }
}
