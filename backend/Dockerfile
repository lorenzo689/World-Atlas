# Multi-stage build: compile with Maven, run on a slim JRE.
# Build context is ./backend, but the jar also packages ../public/data and ../public/flags,
# so build from the repository root:   docker build -f backend/Dockerfile -t world-explorer-backend .

FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY backend/.mvn backend/.mvn
COPY backend/mvnw backend/pom.xml backend/
# download dependencies first: this layer is cached as long as pom.xml does not change
RUN cd backend && ./mvnw -q -B dependency:go-offline
COPY backend/src backend/src
COPY public/data public/data
COPY public/flags public/flags
RUN cd backend && ./mvnw -q -B package -DskipTests \
    && java -Djarmode=tools -jar target/world-explorer-backend-*.jar extract --layers --launcher --destination /app

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 1001 app
# layered jar: dependencies change rarely, application classes often → better image layer caching
COPY --from=build /app/dependencies/ ./
COPY --from=build /app/spring-boot-loader/ ./
COPY --from=build /app/snapshot-dependencies/ ./
COPY --from=build /app/application/ ./
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseZGC"
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
