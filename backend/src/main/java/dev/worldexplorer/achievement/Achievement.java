package dev.worldexplorer.achievement;

/** The catalog of badges. Titles/descriptions are English; the frontend translates them by {@link #name()}. */
public enum Achievement {
    FIRST_QUIZ("First steps", "Finish your first quiz", "🎯"),
    PERFECT_GAME("Flawless", "Answer every question of a 10-question quiz correctly", "💎"),
    SCORE_12K("High scorer", "Score 12,000 points in one quiz", "🚀"),
    STREAK_3("On a roll", "Play the daily challenge 3 days in a row", "🔥"),
    STREAK_7("Weekly habit", "Play the daily challenge 7 days in a row", "📅"),
    STREAK_30("Devotee", "Play the daily challenge 30 days in a row", "🏆"),
    AFRICA_10("Africa expert", "Answer correctly about 10 different African countries", "🌍"),
    AMERICAS_10("Americas expert", "Answer correctly about 10 different countries of the Americas", "🌎"),
    ASIA_10("Asia expert", "Answer correctly about 10 different Asian countries", "🌏"),
    EUROPE_10("Europe expert", "Answer correctly about 10 different European countries", "🏰"),
    OCEANIA_10("Oceania expert", "Answer correctly about 10 different countries of Oceania", "🏝️"),
    WORLD_50("World expert", "Answer correctly about 50 different countries", "🧭"),
    FIRST_WIN("Champion", "Win a multiplayer match", "🥇"),
    WINS_5("Serial winner", "Win 5 multiplayer matches", "👑"),
    TRAVELER_10("Traveler", "Mark 10 countries as visited", "✈️"),
    GLOBETROTTER_25("Globetrotter", "Mark 25 countries as visited", "🗺️"),
    FIRST_NOTE("Chronicler", "Write your first travel note", "📝"),
    COLLECTOR_10("Collector", "Add 10 countries to your favourites", "❤️");

    private final String title;
    private final String description;
    private final String icon;

    Achievement(String title, String description, String icon) {
        this.title = title;
        this.description = description;
        this.icon = icon;
    }

    public String title() { return title; }
    public String description() { return description; }
    public String icon() { return icon; }

    /** Region badge for a country region, or null. */
    static Achievement forRegion(String region) {
        return switch (region) {
            case "Africa" -> AFRICA_10;
            case "Americas" -> AMERICAS_10;
            case "Asia" -> ASIA_10;
            case "Europe" -> EUROPE_10;
            case "Oceania" -> OCEANIA_10;
            default -> null;
        };
    }
}
