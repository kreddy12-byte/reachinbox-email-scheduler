FROM docker.elastic.co/elasticsearch/elasticsearch:8.15.3

ENV discovery.type=single-node
ENV xpack.security.enabled=false
ENV xpack.security.http.ssl.enabled=false
ENV network.host=0.0.0.0
ENV ES_JAVA_OPTS="-Xms512m -Xmx512m"

# Render private services expect the process to listen on $PORT.
# Default to 9200 for local Docker builds of this image.
ENV PORT=9200

USER root
COPY render-entrypoint.sh /usr/local/bin/render-entrypoint.sh
RUN chmod +x /usr/local/bin/render-entrypoint.sh \
  && chown elasticsearch:root /usr/local/bin/render-entrypoint.sh

USER elasticsearch
ENTRYPOINT ["/usr/local/bin/render-entrypoint.sh"]
