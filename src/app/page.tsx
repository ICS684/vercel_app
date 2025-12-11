'use client';

import { Col, Container, Row } from 'react-bootstrap';
import BubbleMap from '../components/BubbleMap';

const Home = () => (
  <main
    style={{
      paddingTop: 24,
      paddingBottom: 24,
    }}
  >
    <Container
      id="landing-page"
      fluid
      className="py-3"
      style={{
        maxWidth: 1400,
      }}
    >
      <Row className="text-center">
        <Col xs={12} className="d-flex flex-column align-items-center mt-4">
          <h1
            className="mb-4"
            style={{
              color: '#e5e7eb',
              fontSize: 28,
            }}
          >
            ZHVI Visualization
          </h1>
          <p
            style={{
              marginTop: -12,
              marginBottom: 24,
              color: '#9ca3af',
              fontSize: 14,
            }}
          >
            Explore average single-family home values across the United States. Zoom in to
            reveal finer-grained bubbles.
          </p>
          <div style={{ width: '100%' }}>
            <BubbleMap />
          </div>
        </Col>
      </Row>
    </Container>
  </main>
);

export default Home;
