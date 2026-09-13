import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./layout/AppShell.tsx";
import Config from "./pages/Config.tsx";
import ConfigAgent from "./pages/ConfigAgent.tsx";
import ConfigGeneral from "./pages/ConfigGeneral.tsx";
import ConfigHaproxy from "./pages/ConfigHaproxy.tsx";
import { ConfigProvider } from "./pages/ConfigProvider.tsx";
import Paths from "./pages/Paths.tsx";
import { PathsProvider } from "./pages/PathsProvider.tsx";
import Certificates from "./pages/Certificates.tsx";
import { CertificatesProvider } from "./pages/CertificatesProvider.tsx";
import Ports from "./pages/Ports.tsx";
import { PortsProvider } from "./pages/PortsProvider.tsx";
import Upstreams from "./pages/Upstreams.tsx";
import { UpstreamsProvider } from "./pages/UpstreamsProvider.tsx";
import Servers from "./pages/Servers.tsx";
import { ServersProvider } from "./pages/ServersProvider.tsx";
import Datasets from "./pages/Datasets.tsx";
import { DatasetsProvider } from "./pages/DatasetsProvider.tsx";
import InspectorCatalog from "./pages/InspectorCatalog.tsx";
import { InspectorCatalogProvider } from "./pages/InspectorCatalogProvider.tsx";
import FleetPage from "./pages/FleetPage.tsx";
import Help from "./pages/Help.tsx";
import { FleetProvider } from "./pages/FleetProvider.tsx";
import Incidents from "./pages/Incidents.tsx";
import Logs from "./pages/Logs.tsx";
import Lists from "./pages/Lists.tsx";
import { ListsProvider } from "./pages/ListsProvider.tsx";
import Profiles from "./pages/Profiles.tsx";
import { ProfilesProvider } from "./pages/ProfilesProvider.tsx";
import IpCountries from "./pages/IpCountries.tsx";
import { IpCountriesProvider } from "./pages/IpCountriesProvider.tsx";
import IpAsns from "./pages/IpAsns.tsx";
import { IpAsnsProvider } from "./pages/IpAsnsProvider.tsx";
import AuthProfiles from "./pages/AuthProfiles.tsx";
import CaptchaProfiles from "./pages/CaptchaProfiles.tsx";
import JsonProfiles from "./pages/JsonProfiles.tsx";
import { CaptchaProvider } from "./pages/CaptchaProvider.tsx";
import { JsonProvider } from "./pages/JsonProvider.tsx";
import CounterProfiles from "./pages/CounterProfiles.tsx";
import { CounterProvider } from "./pages/CounterProvider.tsx";
import { AuthProvider } from "./pages/AuthProvider.tsx";
import ActionProfiles from "./pages/ActionProfiles.tsx";
import CookieProfiles from "./pages/CookieProfiles.tsx";
import { ActionProfilesProvider } from "./pages/ActionProfilesProvider.tsx";
import { CookieProfilesProvider } from "./pages/CookieProfilesProvider.tsx";
import VlaiProfiles from "./pages/VlaiProfiles.tsx";
import { VlaiProfilesProvider } from "./pages/VlaiProfilesProvider.tsx";
import RewriteProfiles from "./pages/RewriteProfiles.tsx";
import { RewriteProfilesProvider } from "./pages/RewriteProfilesProvider.tsx";
import IpProfiles from "./pages/IpProfiles.tsx";
import { IpProfilesProvider } from "./pages/IpProfilesProvider.tsx";
import IpSets from "./pages/IpSets.tsx";
import { IpSetsProvider } from "./pages/IpSetsProvider.tsx";
import { FleetSocket } from "./fleet-socket.tsx";
import { ConvergenceWatch } from "./convergence.tsx";
import { IpGeoProvider } from "./components/ip-geo/index.ts";
import { SessionProvider } from "./session/SessionProvider.tsx";
import { LicenseConsent } from "./session/LicenseConsent.tsx";
import License from "./pages/License.tsx";

export default function App() {
  return (
    <IpGeoProvider>
      <SessionProvider>
        <FleetSocket />
        <ConvergenceWatch />
        {/* Окно согласия с лицензией: поверх оболочки, пока не приняли. */}
        <LicenseConsent />
        <AppShell>
          <Routes>
            <Route
              path="/"
              element={
                <FleetProvider>
                  <FleetPage />
                </FleetProvider>
              }
            />
            <Route path="/fleet" element={<Navigate to="/" replace />} />
            <Route
              path="/datasets"
              element={
                <DatasetsProvider>
                  <Datasets kind="list" />
                </DatasetsProvider>
              }
            />
            <Route
              path="/rules"
              element={
                <ListsProvider>
                  <Lists />
                </ListsProvider>
              }
            />
            <Route
              path="/rules/profiles"
              element={
                <ProfilesProvider>
                  <Profiles />
                </ProfilesProvider>
              }
            />
            <Route path="/rule-sets" element={<Navigate to="/rules" replace />} />
            <Route
              path="/rule-sets/profiles"
              element={<Navigate to="/rules/profiles" replace />}
            />
            <Route
              path="/ip"
              element={
                <IpCountriesProvider>
                  <IpCountries />
                </IpCountriesProvider>
              }
            />
            <Route
              path="/ip/asn"
              element={
                <IpAsnsProvider>
                  <IpAsns />
                </IpAsnsProvider>
              }
            />
            <Route
              path="/ip/sets"
              element={
                <IpSetsProvider>
                  <IpSets />
                </IpSetsProvider>
              }
            />
            <Route
              path="/actions"
              element={
                <ActionProfilesProvider>
                  <ActionProfiles />
                </ActionProfilesProvider>
              }
            />
            <Route
              path="/cookie"
              element={
                <CookieProfilesProvider>
                  <CookieProfiles />
                </CookieProfilesProvider>
              }
            />
            <Route
              path="/ip/profiles"
              element={
                <IpProfilesProvider>
                  <IpProfiles />
                </IpProfilesProvider>
              }
            />
            <Route
              path="/auth"
              element={
                <AuthProvider>
                  <AuthProfiles />
                </AuthProvider>
              }
            />
            <Route
              path="/captcha"
              element={
                <CaptchaProvider>
                  <CaptchaProfiles />
                </CaptchaProvider>
              }
            />
            <Route
              path="/json"
              element={
                <JsonProvider>
                  <JsonProfiles />
                </JsonProvider>
              }
            />
            <Route
              path="/counter"
              element={
                <CounterProvider>
                  <CounterProfiles />
                </CounterProvider>
              }
            />
            <Route
              path="/vlai"
              element={
                <VlaiProfilesProvider>
                  <VlaiProfiles />
                </VlaiProfilesProvider>
              }
            />
            <Route
              path="/rewrite"
              element={
                <RewriteProfilesProvider>
                  <RewriteProfiles />
                </RewriteProfilesProvider>
              }
            />
            {/* Пользователи переехали в списки: раздел был третьим хранилищем. */}
            <Route path="/auth/users" element={<Navigate to="/datasets" replace />} />
            <Route
              path="/inspectors"
              element={
                <InspectorCatalogProvider>
                  <InspectorCatalog />
                </InspectorCatalogProvider>
              }
            />
            <Route path="/incidents" element={<Incidents />} />
            {/*
              Логи процессов -- своя страница, не вкладка журнала: в waf.log
              строка текста без ray и без вердикта, и рядом с записью запроса
              ей место только в меню.
            */}
            <Route path="/logs" element={<Logs />} />
            <Route
              path="/config"
              element={
                <ConfigProvider>
                  <Config />
                </ConfigProvider>
              }
            />
            <Route path="/config/setup" element={<Navigate to="/config" replace />} />
            {/*
              «Общая» правит тот же документ, что и «http»: скелет файла и
              шину. Поэтому провайдер один и тот же -- страницы делят загрузку
              и сохранение (config/http-draft.tsx).
            */}
            <Route
              path="/config/general"
              element={
                <ConfigProvider>
                  <ConfigGeneral />
                </ConfigProvider>
              }
            />
            {/*
              Настройки агента -- свой документ и своя раскатка, поэтому и
              провайдера конфигурации http у страницы нет: она грузит своё.
            */}
            <Route path="/config/agent" element={<ConfigAgent />} />
            {/*
              haproxy -- тоже свой документ и своя раскатка: контроллер
              собирает файл целиком, применяет агент балансировщика.
            */}
            <Route path="/config/haproxy" element={<ConfigHaproxy />} />
            <Route
              path="/structure/ports"
              element={
                <PortsProvider>
                  <Ports />
                </PortsProvider>
              }
            />
            <Route
              path="/structure/upstreams"
              element={
                <UpstreamsProvider>
                  <Upstreams />
                </UpstreamsProvider>
              }
            />
            <Route
              path="/structure/servers"
              element={
                <ServersProvider>
                  <Servers />
                </ServersProvider>
              }
            />
            <Route
              path="/structure/paths"
              element={
                <PathsProvider>
                  <Paths />
                </PathsProvider>
              }
            />
            {/*
              Файлы -- те же наборы, вид «содержимое»: одно хранилище на всё,
              что уезжает на край целиком. Страницы отказа были первыми, но не
              единственными: там же лежат спецификации контракта API.
            */}
            <Route
              path="/datasets/files"
              element={
                <DatasetsProvider>
                  <Datasets kind="content" />
                </DatasetsProvider>
              }
            />
            {/* Обе прежние ссылки ведут туда же: закладки ломать незачем. */}
            <Route
              path="/datasets/pages"
              element={<Navigate to="/datasets/files" replace />}
            />
            <Route
              path="/config/pages"
              element={<Navigate to="/datasets/files" replace />}
            />
            <Route
              path="/datasets/certificates"
              element={
                <CertificatesProvider>
                  <Certificates />
                </CertificatesProvider>
              }
            />
            {/*
              Схема контура уехала из конфигурации в «Структуру»: старые
              ссылки на /config/* ведут туда же, чтобы закладки не отвалились.
            */}
            <Route
              path="/structure"
              element={<Navigate to="/structure/ports" replace />}
            />
            <Route
              path="/config/ports"
              element={<Navigate to="/structure/ports" replace />}
            />
            <Route
              path="/config/upstreams"
              element={<Navigate to="/structure/upstreams" replace />}
            />
            <Route
              path="/config/servers"
              element={<Navigate to="/structure/servers" replace />}
            />
            <Route
              path="/config/paths"
              element={<Navigate to="/structure/paths" replace />}
            />
            <Route
              path="/config/certificates"
              element={<Navigate to="/datasets/certificates" replace />}
            />
            <Route
              path="/structure/certificates"
              element={<Navigate to="/datasets/certificates" replace />}
            />
            <Route path="/license" element={<License />} />
            <Route path="/help" element={<Help />} />
            <Route path="/help/:slug" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </SessionProvider>
    </IpGeoProvider>
  );
}
