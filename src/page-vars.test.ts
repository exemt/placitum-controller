import assert from "node:assert/strict";
import test from "node:test";

import { pageVars } from "./page-vars.ts";

/*
 * Страница отказа называет переменные двумя способами: печатает через `echo`
 * и ветвится по ним в `expr`. Обе формы -- одно и то же имя, потому что и
 * открывает, и запирает их одна запись каталога.
 */
test("имена собираются и из echo, и из условий", () => {
  const page = `
    <p><!--# echo var="waf_deny_status" default="403" --></p>
    <!--# if expr="$waf_deny_scope = network" -->
      <p>Закрыта сеть <!--# echo var="waf_deny_subject" default="" --></p>
    <!--# elif expr="$waf_deny_retry" -->
      <p>Позже</p>
    <!--# endif -->
  `;

  assert.deepEqual(pageVars(page), [
    "waf_deny_retry",
    "waf_deny_scope",
    "waf_deny_status",
    "waf_deny_subject",
  ]);
});

/*
 * Разбор не считает ветки: имя, упомянутое в недостижимой ветке, всё равно
 * упомянуто. Панель говорит про перечень, а не гадает, какой отказ случится.
 */
test("недостижимая ветка тоже называет переменную", () => {
  const page = `
    <!--# if expr="$waf_deny_scope = country" -->
      <!--# echo var="waf_deny_ray" default="" -->
    <!--# else -->
      <!--# echo var="waf_deny_addr" default="" -->
    <!--# endif -->
  `;

  assert.deepEqual(pageVars(page), ["waf_deny_addr", "waf_deny_ray", "waf_deny_scope"]);
});

/*
 * `$` в тексте страницы -- просто доллар: nginx подставляет только внутри
 * своих директив. Считать его именем значило бы пугать оператора цитатой из
 * прайса.
 */
test("доллар в тексте переменной не считается", () => {
  assert.deepEqual(pageVars("<p>Цена $waf_deny_ray за штуку</p>"), []);
});

/* Повторы и порядок появления наружу не выходят: список -- свойство набора. */
test("повторы схлопываются, список отсортирован", () => {
  const page = `
    <!--# echo var="waf_deny_ray" -->
    <!--# echo var="waf_deny_addr" -->
    <!--# echo var="waf_deny_ray" -->
  `;

  assert.deepEqual(pageVars(page), ["waf_deny_addr", "waf_deny_ray"]);
});

/*
 * Диагностика в шаблоне -- то, ради чего разбор и заведён: гейт `params=` её
 * не закрывает, и увидеть её надо в панели, а не у клиента.
 */
test("диагностические имена видны наравне с клиентскими", () => {
  const page = `<!--# echo var="waf_reason" default="" --><!--# echo var="waf_score" -->`;

  assert.deepEqual(pageVars(page), ["waf_reason", "waf_score"]);
});

/* Пустое тело и тело без SSI -- не ошибка, а пустой список. */
test("страница без директив не называет ничего", () => {
  assert.deepEqual(pageVars(""), []);
  assert.deepEqual(pageVars("<html><body>Доступ закрыт</body></html>"), []);
});

/*
 * json-близнец страницы устроен так же: разбор смотрит на директивы, а не на
 * разметку вокруг них.
 */
test("json-страница разбирается тем же способом", () => {
  const page = `{"ray": "<!--# echo var="waf_deny_ray" default="" -->"}`;

  assert.deepEqual(pageVars(page), ["waf_deny_ray"]);
});
