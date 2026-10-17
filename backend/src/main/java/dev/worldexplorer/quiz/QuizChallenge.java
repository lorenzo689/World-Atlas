package dev.worldexplorer.quiz;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A "duel": a link anyone can open to play exactly the same questions. Only the random seed is stored –
 * the questions are regenerated from it, which is cheap and keeps the table tiny.
 */
@Entity
@Table(name = "quiz_challenge")
public class QuizChallenge {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(name = "creator_id")
    private UUID creatorId;

    @Column(name = "creator_name", nullable = false)
    private String creatorName;

    @Column(nullable = false)
    private long seed;

    private String region;

    @Column(nullable = false)
    private int rounds;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected QuizChallenge() {}

    public QuizChallenge(String slug, UUID creatorId, String creatorName, long seed, String region, int rounds) {
        this.id = UUID.randomUUID();
        this.slug = slug;
        this.creatorId = creatorId;
        this.creatorName = creatorName;
        this.seed = seed;
        this.region = region;
        this.rounds = rounds;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getSlug() { return slug; }
    public UUID getCreatorId() { return creatorId; }
    public String getCreatorName() { return creatorName; }
    public long getSeed() { return seed; }
    public String getRegion() { return region; }
    public int getRounds() { return rounds; }
    public Instant getCreatedAt() { return createdAt; }
}
