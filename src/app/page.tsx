import { Col, Container, Row } from 'react-bootstrap';
import USMap from '../components/USMap';
import BubbleMap from '../components/BubbleMap';

/** The Home page. */
const Home = () => (
  <main>
    <Container id="landing-page" fluid className="py-3">
      <Row className="text-center">
        <Col xs={12} className="d-flex flex-column align-items-center mt-5">
          <h1 className="mb-4">ZHVI Visualization</h1>
          <div style={{ width: '100%', maxWidth: 900 }}>
            <USMap />
            <BubbleMap />
          </div>
        </Col>
      </Row>
    </Container>
  </main>
);

export default Home;
