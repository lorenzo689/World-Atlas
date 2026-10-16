package dev.worldexplorer.atlas;

import java.io.Serializable;
import java.util.UUID;

/** Composite primary key (user, country) shared by {@link Favorite} and {@link TravelEntry}. */
public record UserCountryId(UUID userId, String countryCode) implements Serializable {}
