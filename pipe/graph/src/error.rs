use crate::schema::NodeId;

#[derive(Debug)]
pub enum GraphError {
    Sql(sqlx::Error),
    Json(serde_json::Error),
    ParseType(String),
    BadBlob,
    BadTimestamp,
    BadProps,
    MissingNode(NodeId),
}

impl std::fmt::Display for GraphError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sql(e) => write!(f, "sql: {}", e),
            Self::Json(e) => write!(f, "json: {}", e),
            Self::ParseType(s) => write!(f, "parse type: {}", s),
            Self::BadBlob => write!(f, "bad blob"),
            Self::BadTimestamp => write!(f, "bad timestamp"),
            Self::BadProps => write!(f, "bad props"),
            Self::MissingNode(id) => write!(f, "missing node: {}", id),
        }
    }
}

impl std::error::Error for GraphError {}

impl From<sqlx::Error> for GraphError {
    fn from(e: sqlx::Error) -> Self {
        Self::Sql(e)
    }
}

impl From<serde_json::Error> for GraphError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

#[derive(Debug)]
pub enum IngestError {
    Graph(GraphError),
}

impl std::fmt::Display for IngestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Graph(e) => write!(f, "graph: {}", e),
        }
    }
}

impl std::error::Error for IngestError {}

impl From<GraphError> for IngestError {
    fn from(e: GraphError) -> Self {
        Self::Graph(e)
    }
}
