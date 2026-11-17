package dev.worldexplorer;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * Architecture rules, checked on the compiled classes like any other unit test (no Spring, no Docker).
 *
 * <p>The backend is one deployable, but its top-level packages are modules ({@code atlas}, {@code quiz},
 * {@code search}, ...). These rules keep their dependencies a one-way graph. Each rule was violated
 * before it was added, which is why it exists:
 * <ul>
 *   <li>atlas and search depended on each other (note search endpoint in AtlasController),
 *       as did activity and search (IndexBootstrap listed ActivityDocument);
 *   <li>common depended on auth, country and indicator (SecurityConfig, CacheConfig).
 * </ul>
 * See docs/adr for the decision and docs/BACKEND-GUIDE.md for how modules talk to each other instead
 * (interfaces owned by the lower layer, beans registered by the owning module, events).
 */
@AnalyzeClasses(packages = "dev.worldexplorer", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    /** A dependency cycle means neither module can be understood, tested or changed without the other. */
    @ArchTest
    static final ArchRule modulesAreFreeOfCycles = slices()
            .matching("dev.worldexplorer.(*)..")
            .should().beFreeOfCycles();

    /** common is the shared foundation (config, security, events, errors); every module may use it. */
    @ArchTest
    static final ArchRule commonDoesNotDependOnModules = noClasses()
            .that().resideInAPackage("dev.worldexplorer.common..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "dev.worldexplorer.achievement..", "dev.worldexplorer.activity..", "dev.worldexplorer.atlas..",
                    "dev.worldexplorer.auth..", "dev.worldexplorer.conflict..", "dev.worldexplorer.country..",
                    "dev.worldexplorer.indicator..", "dev.worldexplorer.multiplayer..", "dev.worldexplorer.quiz..",
                    "dev.worldexplorer.search..")
            .because("common is the bottom layer; modules provide implementations of its interfaces instead");
}
